const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  max: 5
});

const send = (res, status, data) => {
  res.status(status).json(data);
};

const readBody = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", (chunk) => { data += chunk; });
  req.on("end", () => {
    try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("JSON inválido")); }
  });
  req.on("error", reject);
});

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/participants" && req.method === "GET") {
      const result = await pool.query("SELECT id, name, department, registration, created_at FROM participants ORDER BY name");
      return send(res, 200, result.rows);
    }
    if (url.pathname === "/api/participants" && req.method === "POST") {
      const data = await readBody(req);
      if (!data.name || !data.department || !data.registration) return send(res, 400, { error: "Preencha nome, setor e matrícula." });
      const result = await pool.query(
        "INSERT INTO participants (name, department, registration) VALUES ($1, $2, $3) RETURNING *",
        [data.name.trim(), data.department.trim(), data.registration.trim()]
      );
      return send(res, 201, result.rows[0]);
    }
    if (url.pathname === "/api/attendance" && req.method === "GET") {
      const day = url.searchParams.get("day");
      const result = await pool.query(
        `SELECT p.id, p.name, p.department, p.registration,
                (a.id IS NOT NULL) AS present
         FROM participants p
         LEFT JOIN attendance a ON a.participant_id = p.id AND a.event_day = $1
         ORDER BY p.name`, [day]
      );
      return send(res, 200, result.rows);
    }
    if (url.pathname === "/api/attendance" && req.method === "POST") {
      const data = await readBody(req);
      if (!data.participantId || !data.day) return send(res, 400, { error: "Participante e dia são obrigatórios." });
      if (data.present) {
        await pool.query(
          "INSERT INTO attendance (participant_id, event_day) VALUES ($1, $2) ON CONFLICT (participant_id, event_day) DO NOTHING",
          [data.participantId, data.day]
        );
      } else {
        await pool.query("DELETE FROM attendance WHERE participant_id = $1 AND event_day = $2", [data.participantId, data.day]);
      }
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/raffle" && req.method === "GET") {
      const result = await pool.query(
        `SELECT DISTINCT p.id, p.name, p.department
         FROM participants p JOIN attendance a ON a.participant_id = p.id
         ORDER BY p.name`
      );
      return send(res, 200, result.rows);
    }
    return send(res, 404, { error: "Rota não encontrada." });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "Não foi possível concluir a operação." });
  }
};
