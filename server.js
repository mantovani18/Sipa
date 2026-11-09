const http = require("http");
const { randomInt } = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "sipa",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || undefined
});

const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
};

const body = (req) => {
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

async function api(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,DELETE" });
    return res.end();
  }
  if (url.pathname === "/api/participants" && req.method === "GET") {
    const result = await pool.query("SELECT id, name, department, created_at FROM participants ORDER BY name");
    return json(res, 200, result.rows);
  }
  if (url.pathname === "/api/participants" && req.method === "POST") {
    const data = await body(req);
    if (typeof data.name !== "string" || typeof data.department !== "string"
      || !data.name.trim() || !data.department.trim()) {
      return json(res, 400, { error: "Preencha nome e setor." });
    }
    const result = await pool.query(
      "INSERT INTO participants (name, department) VALUES ($1, $2) RETURNING *",
      [data.name.trim(), data.department.trim()]
    );
    return json(res, 201, result.rows[0]);
  }
  if (url.pathname.startsWith("/api/participants/") && req.method === "DELETE") {
    const id = Number(url.pathname.split("/").pop());
    if (!Number.isInteger(id)) return json(res, 400, { error: "Usuário inválido." });
    await pool.query("DELETE FROM participants WHERE id = $1", [id]);
    return json(res, 200, { ok: true });
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
    return json(res, 200, result.rows);
  }
  if (url.pathname === "/api/attendance" && req.method === "POST") {
    const data = await body(req);
    if (!data.participantId || !data.day) return json(res, 400, { error: "Participante e dia são obrigatórios." });
    if (data.present) {
      await pool.query(
        "INSERT INTO attendance (participant_id, event_day) VALUES ($1, $2) ON CONFLICT (participant_id, event_day) DO NOTHING",
        [data.participantId, data.day]
      );
    } else {
      await pool.query("DELETE FROM attendance WHERE participant_id = $1 AND event_day = $2", [data.participantId, data.day]);
    }
    return json(res, 200, { ok: true });
  }
  if (url.pathname === "/api/raffle" && req.method === "GET") {
    const day = url.searchParams.get("day");
    if (!day) return json(res, 400, { error: "Informe o dia do sorteio." });
    const result = await pool.query(
      `SELECT p.id, p.name, p.department, r.id AS raffle_id
       FROM participants p JOIN attendance a ON a.participant_id = p.id
       LEFT JOIN raffles r ON r.winner_id = p.id AND r.event_day = a.event_day
       WHERE a.event_day = $1
       ORDER BY p.name`, [day]
    );
    const raffle = await pool.query(
      `SELECT r.id, r.created_at, p.id AS winner_id, p.name, p.department
       FROM raffles r JOIN participants p ON p.id = r.winner_id
       WHERE r.event_day = $1`, [day]
    );
    return json(res, 200, {
      eligible: result.rows.map(({ raffle_id, ...person }) => person),
      winner: raffle.rows[0] || null
    });
  }
  if (url.pathname === "/api/raffle" && req.method === "POST") {
    const data = await body(req);
    if (!data.day) return json(res, 400, { error: "Informe o dia do sorteio." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [data.day]);
      const existing = await client.query("SELECT id FROM raffles WHERE event_day = $1 FOR UPDATE", [data.day]);
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "O sorteio deste dia já foi realizado." });
      }
      const eligible = await client.query(
        `SELECT p.id, p.name, p.department
         FROM participants p JOIN attendance a ON a.participant_id = p.id
         WHERE a.event_day = $1
         ORDER BY p.id`, [data.day]
      );
      if (!eligible.rowCount) {
        await client.query("ROLLBACK");
        return json(res, 400, { error: "Não há participantes elegíveis para este dia." });
      }
      const winner = eligible.rows[randomInt(eligible.rowCount)];
      const saved = await client.query(
        `INSERT INTO raffles (event_day, winner_id)
         VALUES ($1, $2)
         RETURNING id, created_at`, [data.day, winner.id]
      );
      await client.query("COMMIT");
      return json(res, 201, { ...winner, raffleId: saved.rows[0].id, createdAt: saved.rows[0].created_at });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return json(res, 404, { error: "Rota não encontrada." });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(root, requested);
    if (!file.startsWith(root) || !fs.existsSync(file)) return json(res, 404, { error: "Arquivo não encontrado." });
    const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
    res.writeHead(200, { "Content-Type": `${types[path.extname(file)] || "text/plain"}; charset=utf-8` });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    const message = process.env.NODE_ENV === "production"
      ? "Não foi possível concluir a operação."
      : `Erro no PostgreSQL: ${error.message}`;
    if (error.code === "42P01") {
      return json(res, 503, { error: "A tabela de sorteios não existe. Execute database.sql no mesmo PostgreSQL configurado na aplicação." });
    }
    json(res, 500, { error: message });
  }
});

server.listen(port, () => console.log(`SIPA disponível em http://localhost:${port}`));
