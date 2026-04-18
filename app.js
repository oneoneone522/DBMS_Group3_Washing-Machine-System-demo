// app.js
import express from "express";
import mysqlConnectionPool from "./lib/mysql.js";
const app = express();

// first middleware
app.use(express.static('.'))
app.use(express.urlencoded({ extended: true }));
// second middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});


app.get('/', (req, res) => {
  res.sendFile('index.html', {root:'.'});  // 對應 views/index.ejs
});

app.get('/signup',(req,res) => {
  res.sendFile('signup.html', {root:'.'});
})
app.get('/api/dorm', async (req, res) => {
  const [rows] = await mysqlConnectionPool.query('SELECT DORM_NAME FROM DORM');
  return res.status(200).json(rows);
});
app.post("/signup", async (req, res) => {
  const dorm = req.body["dorm"];
  const user_name = req.body["user_name"];
  const student_id = req.body["student_id"];
  const email = req.body["email"];
  const password = req.body["password"];

  await mysqlConnectionPool.query(
    "INSERT INTO User (Dorm, User_Name, Student_ID, Email, Password) VALUES (?, ?, ?, ?, ?)",
    [dorm, user_name, student_id, email, password]
  );
  res.redirect('/login');
  return res.status(201).json({ success: true });
  
});

app.get('/login', (req, res) => {
  res.sendFile('login.html', {root:'.'});
});

app.post("/login", async (req, res) => {
  const email = req.body["email"];
  const password = req.body["password"];

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

// async function runTest() {
//   const mysql = await mysqlConnectionPool.getConnection();
//   const result = await mysql.query("SELECT 1+1");
//   console.log(result);
//   process.exit();
// }

// runTest();