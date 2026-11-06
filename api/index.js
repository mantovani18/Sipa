const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_PRISMA_URL
  || process.env.POSTGRES_URL_NON_POOLING;
const pool = new Pool({
  connectionString,
  host: connectionString ? undefined : (process.env.PGHOST || "localhost"),
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "sipa",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || undefined,
  ssl: connectionString ? { rejectUnauthorized: false } : undefined,
  max: 5
});

const send = (res, status, data) => {
  res.status(status).json(data);
};

const readBody = (req) => {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      try { return Promise.resolve(req.body ? JSON.parse(req.body) : {}); } catch { return Promise.reject(new Error("JSON inválido")); }
    }
    return Promise.resolve(req.body || {});
  }
  return new Promise((resolve, reject) => {
  let data = "";
  req.on("data", (chunk) => { data += chunk; });
  req.on("end", () => {
    try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("JSON inválido")); }
  });
  req.on("error", reject);
  });
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/participants" && req.method === "GET") {
      const result = await pool.query("SELECT id, name, department, created_at FROM participants ORDER BY name");
      return send(res, 200, result.rows);
    }
    if (url.pathname === "/api/participants" && req.method === "POST") {
      const data = await readBody(req);
      if (typeof data.name !== "string" || typeof data.department !== "string"
        || !data.name.trim() || !data.department.trim()) {
        return send(res, 400, { error: "Preencha nome e setor." });
      }
      const result = await pool.query(
        "INSERT INTO participants (name, department) VALUES ($1, $2) RETURNING *",
        [data.name.trim(), data.department.trim()]
      );
      return send(res, 201, result.rows[0]);
    }
    if (url.pathname.startsWith("/api/participants/") && req.method === "DELETE") {
      const id = Number(url.pathname.split("/").pop());
      if (!Number.isInteger(id)) return send(res, 400, { error: "Usuário inválido." });
      await pool.query("DELETE FROM participants WHERE id = $1", [id]);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/attendance" && req.method === "GET") {
      const day = url.searchParams.get("day");
      const result = await pool.query(
        `SELECT p.id, p.name, p.department,
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
      const day = url.searchParams.get("day");
      if (!day) return send(res, 400, { error: "Informe o dia do sorteio." });
      const result = await pool.query(
        `SELECT p.id, p.name, p.department
         FROM participants p JOIN attendance a ON a.participant_id = p.id
         WHERE a.event_day = $1
         ORDER BY p.name`, [day]
      );
      return send(res, 200, result.rows);
    }
    return send(res, 404, { error: "Rota não encontrada." });
  } catch (error) {
    console.error(error);
    if (error.code === "42P01") {
      return send(res, 503, { error: "Banco conectado, mas as tabelas não foram criadas. Execute database.sql no PostgreSQL." });
    }
    if (["ECONNREFUSED", "ENOTFOUND", "28P01", "3D000", "42501"].includes(error.code)) {
      return send(res, 503, { error: "Não foi possível conectar ao PostgreSQL. Verifique as variáveis de ambiente do banco." });
    }
    if (error.code === "23502" && error.column === "registration") {
      return send(res, 503, { error: "O banco ainda possui a coluna antiga registration. Execute a migração do database.sql no banco da Vercel." });
    }
    return send(res, 500, { error: "Não foi possível concluir a operação." });
  }
};
