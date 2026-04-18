// ══════════════════════════════════════════════════
//  PyBank — Cloudflare Worker (worker.js) — v2 FIXED
//  Neon PostgreSQL via @neondatabase/serverless (ESM)
// ══════════════════════════════════════════════════
//
//  ✅  DEPLOY STEPS:
//  1.  dash.cloudflare.com → Workers & Pages → Create Worker
//  2.  Paste this file in the editor → Deploy
//  3.  Worker Settings → Variables → Add:
//        Name  : DATABASE_URL
//        Value : postgresql://neondb_owner:npg_kuXI3LOC1QAf@ep-lucky-hall-a10bbj3u-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
//  4.  Save and Deploy
//  5.  Copy Worker URL → paste into script.js  API_BASE  and
//      index.html  API_BASE  (both on line ~9 / ~376)
//
//  ✅  TEST IN BROWSER AFTER DEPLOY:
//      https://your-worker.workers.dev/api/stats
//      https://your-worker.workers.dev/api/questions?unit=1
//      https://your-worker.workers.dev/api/visitor

import { neon } from "https://esm.sh/@neondatabase/serverless@0.10.4";

// ── CORS ──────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type":                 "application/json",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// ── MAIN HANDLER ─────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // Pre-flight CORS
    if (method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // Guard: DATABASE_URL must be set
    if (!env.DATABASE_URL) {
      return json({
        error: "DATABASE_URL not set. Go to Worker → Settings → Variables and add DATABASE_URL."
      }, 500);
    }

    // Create Neon SQL client (HTTP-based, works in Cloudflare Workers)
    const sql = neon(env.DATABASE_URL);

    try {

      // ══════════════════════════════════════════
      //  GET /api/questions?unit=all|1|2|...|10
      // ══════════════════════════════════════════
      if (path === "/api/questions" && method === "GET") {
        const unit = url.searchParams.get("unit") || "all";

        let rows;

        if (unit === "all") {
          rows = await sql`
            SELECT
              sr_no         AS id,
              unit_number   AS unit,
              question_text AS question,
              answer,
              marks,
              previous_year AS pyq_year,
              option_a,
              option_b,
              option_c,
              option_d
            FROM questions_clean
            WHERE marks IS NOT NULL
            ORDER BY sr_no ASC
          `;
        } else {
          const unitNum = parseInt(unit);
          if (isNaN(unitNum) || unitNum < 1 || unitNum > 10) {
            return json({ error: "Invalid unit number. Use 1-10 or 'all'." }, 400);
          }
          rows = await sql`
            SELECT
              sr_no         AS id,
              unit_number   AS unit,
              question_text AS question,
              answer,
              marks,
              previous_year AS pyq_year,
              option_a,
              option_b,
              option_c,
              option_d
            FROM questions_clean
            WHERE marks IS NOT NULL
              AND unit_number = ${unitNum}
            ORDER BY sr_no ASC
          `;
        }

        // Shape rows into frontend-expected format
        const questions = rows.map(r => {
          const hasOptions = r.option_a && r.option_a.trim() !== "";
          const isMCQ      = hasOptions;

          const pyqRaw  = r.pyq_year ? r.pyq_year.trim() : "";
          const pyqYear = (pyqRaw !== "" && pyqRaw.toLowerCase() !== "no") ? pyqRaw : null;

          const q = {
            id:       parseInt(r.id),
            unit:     parseInt(r.unit),
            type:     isMCQ ? "mcq" : "descriptive",
            question: r.question  || "",
            marks:    r.marks     ? parseInt(r.marks) : 1,
            pyq:      !!pyqYear,
            pyq_year: pyqYear,
          };

          if (isMCQ) {
            q.options = [r.option_a, r.option_b, r.option_c, r.option_d].filter(Boolean);
            q.answer  = r.answer ? r.answer.trim().toUpperCase() : "A";
          } else {
            // Descriptive / coding: answer column holds the Python solution
            q.code = r.answer || "";
          }

          return q;
        });

        return json(questions);
      }

      // ══════════════════════════════════════════
      //  GET /api/visitor  — increment + return count
      // ══════════════════════════════════════════
      if (path === "/api/visitor" && method === "GET") {
        await sql`
          INSERT INTO visitor_counter (id, count, last_updated)
          VALUES (1, 1, NOW())
          ON CONFLICT (id) DO UPDATE
            SET count        = visitor_counter.count + 1,
                last_updated = NOW()
        `;

        const rows  = await sql`SELECT count FROM visitor_counter WHERE id = 1`;
        const count = rows[0]?.count ?? 0;
        return json({ count: parseInt(count) });
      }

      // ══════════════════════════════════════════
      //  GET /api/stats  — counts for homepage
      // ══════════════════════════════════════════
      if (path === "/api/stats" && method === "GET") {
        const rows = await sql`
          SELECT
            COUNT(*)                                                                AS total,
            COUNT(*) FILTER (
              WHERE option_a IS NOT NULL AND option_a != ''
            )                                                                       AS mcq_count,
            COUNT(*) FILTER (
              WHERE previous_year IS NOT NULL
                AND previous_year != ''
                AND LOWER(previous_year) != 'no'
            )                                                                       AS pyq_count,
            COUNT(DISTINCT unit_number)                                             AS units
          FROM questions_clean
          WHERE marks IS NOT NULL
        `;

        const row = rows[0] || {};
        return json({
          total: parseInt(row.total)     || 0,
          mcq:   parseInt(row.mcq_count) || 0,
          pyq:   parseInt(row.pyq_count) || 0,
          units: parseInt(row.units)     || 0,
        });
      }

      // 404 fallback
      return json({ error: "Route not found. Available: /api/questions, /api/visitor, /api/stats" }, 404);

    } catch (err) {
      console.error("Worker error:", err);
      return json({ error: err.message }, 500);
    }
  }
};
