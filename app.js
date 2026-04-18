// app.js
import express from "express";
import mysqlConnectionPool from "./lib/mysql.js";
const app = express();

// first middleware
app.use(express.static('.'))

// second middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});


app.get('/', (req, res) => {
  res.sendFile('index.html', {root:'.'});  // 對應 views/index.ejs
});

app.post("/signup", async (req, res) => {
  const name = req.body["name"];
  const email = req.body["email"];
  const password = req.body["password"];

  await mysqlConnectionPool.query(
    "INSERT INTO User (Name, Email, Password) VALUES (?, ?, ?)",
    [name, email, password]
  );
  return res.status(201).json({ success: true });
});

app.get('/login', (req, res) => {
  res.sendFile('login.html', {root:'.'});
});

app.post("/login", async (req, res) => {
  const email = req.body["email"];
  const account = req.body["account"];

  const result = await mysqlConnectionPool.query(
    "SELECT UserId FROM User WHERE Email = ? AND Password = ?",
    [email, password]
  );
  const rows = result[0];

  if (rows.length === 0) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  return res.status(200).json({ success: true });
});

app.listen(3000, () => {
  console.log("Server starts at port 3000");
});

