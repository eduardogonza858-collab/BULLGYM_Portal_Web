require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const ExcelJS = require("exceljs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "bullgym.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, name TEXT NOT NULL, phone TEXT DEFAULT '',
 email TEXT DEFAULT '', role TEXT NOT NULL DEFAULT 'client',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS routines (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
 title TEXT NOT NULL, details TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
 sender TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS promotions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL,
 price TEXT DEFAULT '', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS trainers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, specialty TEXT DEFAULT '',
 schedule TEXT DEFAULT '', contact TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const getSetting = db.prepare("SELECT value FROM settings WHERE key=?");
const setSetting = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
const defaults = {
 monthly: "450", inscription: "150", coach: "IVAN LOPEZ",
 schedule: "Lunes a viernes: 6:00 AM – 9:00 PM | Sábados: 8:00 AM – 2:00 PM",
 address: "Camino a Toxi Manzana 013, 50490 San Juan de los Jarros, Méx.",
 phone: "+52 722 240 5485", instagram: "bullgym.1 · ivanlopezlopez_",
 payment_account: "", online_advice: "Disponible", in_person_advice: "Disponible"
};
for (const [k,v] of Object.entries(defaults)) if (!getSetting.get(k)) setSetting.run(k,v);

const adminName = process.env.ADMIN_USERNAME || "admin";
const adminPass = process.env.ADMIN_PASSWORD || "CambiaEstaContrasena123!";
if (!db.prepare("SELECT id FROM users WHERE role='admin'").get()) {
  db.prepare("INSERT INTO users(username,password_hash,name,role) VALUES(?,?,?,?)")
    .run(adminName, bcrypt.hashSync(adminPass, 12), "Administrador BULLGYM", "admin");
}
const appSessionStore = SQLiteStore ? new (SQLiteStore(session))({ db: "sessions.sqlite", dir: dataDir }) : undefined;
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(session({
  store: appSessionStore,
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000*60*60*12 }
}));
app.use(express.static(path.join(__dirname, "public")));
const loginLimiter = rateLimit({ windowMs: 15*60*1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const clean = v => String(v ?? "").trim().slice(0, 5000);
const settings = () => Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x=>[x.key,x.value]));
const publicSettings = () => { const s=settings(); delete s.payment_account; return s; };
function auth(req,res,next) { if (!req.session.user) return res.status(401).json({error:"Inicia sesión para continuar."}); next(); }
function admin(req,res,next) { if (!req.session.user || req.session.user.role!=="admin") return res.status(403).json({error:"Acceso exclusivo de administración."}); next(); }
function clientOwn(req,res,next) { const id=Number(req.params.id); if(req.session.user.role!=="admin" && req.session.user.id!==id) return res.status(403).json({error:"No tienes permiso."}); next(); }

app.get("/api/public", (req,res) => {
 res.json({settings:publicSettings(), promotions:db.prepare("SELECT id,title,description,price FROM promotions WHERE active=1").all()});
});
app.post("/api/register", (req,res) => {
 const name=clean(req.body.name), phone=clean(req.body.phone), email=clean(req.body.email);
 if(name.length<2 || phone.length<7) return res.status(400).json({error:"Escribe tu nombre y un teléfono válido."});
 const username="bull"+crypto.randomBytes(3).toString("hex");
 const password=crypto.randomBytes(5).toString("base64url");
 try {
  const info=db.prepare("INSERT INTO users(username,password_hash,name,phone,email,role) VALUES(?,?,?,?,?,'client')")
   .run(username,bcrypt.hashSync(password,12),name,phone,email);
  res.json({message:"Registro recibido. Guarda tus datos de acceso.",username,password,clientId:info.lastInsertRowid});
 } catch(e) { res.status(500).json({error:"No se pudo completar el registro."}); }
});
app.post("/api/login", loginLimiter, (req,res) => {
 const username=clean(req.body.username), password=String(req.body.password||"");
 const user=db.prepare("SELECT * FROM users WHERE username=?").get(username);
 if(!user || !bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:"Usuario o contraseña incorrectos."});
 req.session.user={id:user.id,username:user.username,name:user.name,role:user.role};
 res.json({user:req.session.user});
});
app.post("/api/logout", (req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me", auth, (req,res)=>res.json({user:req.session.user}));
app.get("/api/client-data", auth, (req,res)=>{
 const id=req.session.user.id;
 res.json({
  user:req.session.user,
  routines:db.prepare("SELECT id,title,details,updated_at FROM routines WHERE user_id=? ORDER BY id DESC").all(id),
  messages:db.prepare("SELECT id,sender,body,created_at FROM messages WHERE user_id=? ORDER BY id").all(id)
 });
});
app.post("/api/messages", auth, (req,res)=>{
 const body=clean(req.body.body); if(!body) return res.status(400).json({error:"Escribe un mensaje."});
 db.prepare("INSERT INTO messages(user_id,sender,body) VALUES(?,?,?)").run(req.session.user.id,req.session.user.role==="admin"?"Entrenador":"Cliente",body);
 res.json({ok:true});
});
app.get("/api/admin/overview", admin, (req,res)=>{
 res.json({
  clients:db.prepare("SELECT id,username,name,phone,email,created_at FROM users WHERE role='client' ORDER BY id DESC").all(),
  trainers:db.prepare("SELECT * FROM trainers ORDER BY name").all(),
  promotions:db.prepare("SELECT * FROM promotions ORDER BY id DESC").all(),
  settings:settings(),
  messages:db.prepare("SELECT m.*,u.name AS client_name,u.username FROM messages m JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 100").all()
 });
});
app.put("/api/admin/settings", admin, (req,res)=>{
 const allowed=["monthly","inscription","coach","schedule","address","phone","instagram","payment_account","online_advice","in_person_advice"];
 for(const k of allowed) if(req.body[k]!==undefined) setSetting.run(k,clean(req.body[k]));
 res.json({ok:true,settings:settings()});
});
app.post("/api/admin/promotions", admin, (req,res)=>{
 const {title,description,price}=req.body;
 if(!clean(title)||!clean(description)) return res.status(400).json({error:"Completa título y descripción."});
 const info=db.prepare("INSERT INTO promotions(title,description,price) VALUES(?,?,?)").run(clean(title),clean(description),clean(price));
 res.json({id:info.lastInsertRowid});
});
app.put("/api/admin/promotions/:id", admin, (req,res)=>{
 db.prepare("UPDATE promotions SET title=?,description=?,price=?,active=? WHERE id=?")
 .run(clean(req.body.title),clean(req.body.description),clean(req.body.price),req.body.active?1:0,Number(req.params.id));
 res.json({ok:true});
});
app.delete("/api/admin/promotions/:id", admin, (req,res)=>{db.prepare("DELETE FROM promotions WHERE id=?").run(Number(req.params.id));res.json({ok:true});});
app.post("/api/admin/trainers", admin, (req,res)=>{
 const {name,specialty,schedule,contact}=req.body;
 if(!clean(name)) return res.status(400).json({error:"Escribe el nombre del entrenador."});
 db.prepare("INSERT INTO trainers(name,specialty,schedule,contact) VALUES(?,?,?,?)").run(clean(name),clean(specialty),clean(schedule),clean(contact));
 res.json({ok:true});
});
app.delete("/api/admin/trainers/:id", admin, (req,res)=>{db.prepare("DELETE FROM trainers WHERE id=?").run(Number(req.params.id));res.json({ok:true});});
app.get("/api/admin/clients/:id", admin, (req,res)=>{
 const id=Number(req.params.id);
 res.json({
  client:db.prepare("SELECT id,username,name,phone,email,created_at FROM users WHERE id=? AND role='client'").get(id),
  routines:db.prepare("SELECT * FROM routines WHERE user_id=? ORDER BY id DESC").all(id),
  messages:db.prepare("SELECT * FROM messages WHERE user_id=? ORDER BY id").all(id)
 });
});
app.post("/api/admin/clients/:id/routines", admin, (req,res)=>{
 if(!clean(req.body.title)||!clean(req.body.details)) return res.status(400).json({error:"Completa nombre y contenido de la rutina."});
 db.prepare("INSERT INTO routines(user_id,title,details) VALUES(?,?,?)").run(Number(req.params.id),clean(req.body.title),clean(req.body.details));
 res.json({ok:true});
});
app.delete("/api/admin/routines/:id", admin, (req,res)=>{db.prepare("DELETE FROM routines WHERE id=?").run(Number(req.params.id));res.json({ok:true});});
app.post("/api/admin/clients/:id/messages", admin, (req,res)=>{
 const body=clean(req.body.body); if(!body) return res.status(400).json({error:"Escribe un mensaje."});
 db.prepare("INSERT INTO messages(user_id,sender,body) VALUES(?, 'Entrenador', ?)").run(Number(req.params.id),body);
 res.json({ok:true});
});
app.post("/api/admin/clients/:id/reset-password", admin, (req,res)=>{
 const password=crypto.randomBytes(6).toString("base64url");
 db.prepare("UPDATE users SET password_hash=? WHERE id=? AND role='client'").run(bcrypt.hashSync(password,12),Number(req.params.id));
 res.json({password});
});
app.get("/api/admin/export.xlsx", admin, async (req,res)=>{
 const wb=new ExcelJS.Workbook(); wb.creator="BULLGYM";
 const ws=wb.addWorksheet("Clientes");
 ws.columns=[{header:"ID",key:"id",width:10},{header:"Usuario",key:"username",width:20},{header:"Nombre",key:"name",width:30},{header:"Teléfono",key:"phone",width:20},{header:"Correo",key:"email",width:30},{header:"Fecha de registro",key:"created_at",width:24}];
 ws.addRows(db.prepare("SELECT id,username,name,phone,email,created_at FROM users WHERE role='client' ORDER BY id").all());
 ws.getRow(1).font={bold:true};
 const rs=wb.addWorksheet("Rutinas");
 rs.columns=[{header:"Cliente ID",key:"user_id",width:14},{header:"Rutina",key:"title",width:30},{header:"Detalles",key:"details",width:70},{header:"Actualizada",key:"updated_at",width:24}];
 rs.addRows(db.prepare("SELECT user_id,title,details,updated_at FROM routines").all());
 const ms=wb.addWorksheet("Mensajes");
 ms.columns=[{header:"Cliente ID",key:"user_id",width:14},{header:"Remitente",key:"sender",width:20},{header:"Mensaje",key:"body",width:70},{header:"Fecha",key:"created_at",width:24}];
 ms.addRows(db.prepare("SELECT user_id,sender,body,created_at FROM messages").all());
 res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 res.setHeader("Content-Disposition",'attachment; filename="BULLGYM_clientes.xlsx"');
 await wb.xlsx.write(res); res.end();
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`BULLGYM activo en http://localhost:${PORT}`));
