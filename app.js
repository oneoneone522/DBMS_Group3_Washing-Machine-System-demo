// app.js
import express from "express";
import mysqlConnectionPool from "./lib/mysql.js";
import session from 'express-session';
const app = express();

// first middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// second middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

app.use(session({
  secret: process.env.session_secret,  
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }   // 本地開發用 false，上線再改 true
}));

app.set('view engine', 'ejs');
app.set('views', './views');

//index
app.get('/', (req, res) => {
  // res.render('index.html', {root:'./views'});
  res.render('index',{ title: '使用狀態' });
});

app.get('/api/check-login', (req, res) => {
  if (req.session.user_id) {
    return res.json({ logged_in: true });
  }
  return res.json({ logged_in: false });
});

app.get('/api/usage_record', async (req, res) => {
  if (!req.session.user_id) {
    return res.status(401).json({ message: '請先登入' });
  }

  const [rows] = await mysqlConnectionPool.query(
    `SELECT ur.Usage_ID, ur.Usage_Status, ur.Usage_Status, ur.Machine_ID
     FROM Usage_Record ur
     WHERE ur.User_ID = ?`,
    [req.session.user_id]
  );

  return res.status(200).json(rows);
});

//machine
app.get('/machine', (req, res) => {
  res.render('machine',  {title: '機台使用狀態一覽' });
});

app.get('/api/machine/my-dorm', async (req, res) => {
  if (!req.session.user_id) {
    return res.status(401).json({ message: '請先登入' });
  }
  const [userRows] = await mysqlConnectionPool.query(`SELECT Dorm FROM User WHERE User_ID = ?`, [req.session.user_id]);
  const userDorm = userRows[0].Dorm;
  const [rows] = await mysqlConnectionPool.query(`
    SELECT 
      m.Machine_Number, 
      m.Machine_Status, 
      m.Laundry_Room,
      m.Floor, 
      m.Dorm,
      ur.Usage_Status
    FROM Machine m
    LEFT JOIN usage_record ur
    ON m.Machine_ID = ur.Machine_ID
    WHERE m.Dorm = ?;`,[userDorm]
  );
  return res.status(200).json(rows);
});
//use_confirm
app.get('/use_conform', (req, res) =>{
  res.render('use_confirm', {title: '確認使用機台'});
});

app.get('/api/machine', async(req, res) => {
  
});
//signup
app.get('/signup',(req,res) => {
  // res.render('signup.html', {root:'./views'});
  res.render('signup', {title: '註冊'});
});

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
});

//login
app.get('/login', (req, res) => {
  // res.render('login.ejs', {root:'./views'});
  res.render('login', {title: '登入'});
});

app.post("/login", async (req, res) => {
  const email = req.body["email"];
  const password = req.body["password"];

  const result = await mysqlConnectionPool.query(
    "SELECT User_ID FROM User WHERE Email = ? AND Password = ?",
    [email, password]
  );
  const rows = result[0];

  if (rows.length === 0) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  req.session.user_id = rows[0].User_ID;  // ← 把 User_ID 存進 session
  res.redirect('/'); 
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