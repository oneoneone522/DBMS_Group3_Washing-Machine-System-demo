// app.js
import express from "express";
import mysqlConnectionPool from "./lib/mysql.js";
import session from 'express-session';
import multer from 'multer';
import path from 'path';
const app = express();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'maintenance_photo/');
  },

  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() + path.extname(file.originalname);

    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

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
app.use(express.static('public'));

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
    return res.redirect("/login");
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
app.get('/machine', async (req, res) => {
  if (!req.session.user_id) {
    return res.redirect("/login");
  }
  const [userRows] = await mysqlConnectionPool.query(`SELECT Dorm FROM User WHERE User_ID = ?`, [req.session.user_id]);
  const userDorm = userRows[0].Dorm;
  res.render('machine',  {title: '機台使用狀態一覽' , Dorm: userDorm});
});

app.get('/api/machine/my-dorm', async (req, res) => {
  if (!req.session.user_id) {
    return res.redirect("/login"); 
  }
  const [userRows] = await mysqlConnectionPool.query(`SELECT Dorm FROM User WHERE User_ID = ?`, [req.session.user_id]);
  if (!userRows || userRows.length === 0) {
    return res.status(404).json({ message: "User not found" });
  }
  const userDorm = userRows[0].Dorm;
  const [rows] = await mysqlConnectionPool.query(`
    SELECT 
      m.Machine_Number, 
      m.Floor, 
      m.Dorm,
      ur.Usage_Status
    FROM Machine m
    LEFT JOIN usage_record ur ON m.Machine_ID = ur.Machine_ID
    WHERE m.Dorm = ?;`,[userDorm]
  );
  return res.status(200).json(rows);
});

//machine/floor
app.get('/machine/floor/:floor', async (req, res) => {
  if (!req.session.user_id) {
    return res.redirect('/login');
  }
  const floor = req.params.floor;
  const [userRows] = await mysqlConnectionPool.query(`SELECT Dorm FROM User WHERE User_ID = ?`, [req.session.user_id]);
  if (!userRows || userRows.length === 0) {
    return res.status(404).json({ message: "User not found" });
  }
  const userDorm = userRows[0].Dorm;
  res.render('machine_each_floor', { title: '樓層機台一覽', Dorm: userDorm, floor: floor });
});

app.get('/api/machine/floor/:floor', async (req, res) => {
  if (!req.session.user_id) {
    return res.redirect('/login');
  }
  const [userRows] = await mysqlConnectionPool.query(`SELECT Dorm FROM User WHERE User_ID = ?`, [req.session.user_id]);
  if (!userRows || userRows.length === 0) {
    return res.status(404).json({ message: "User not found" });
  }
  const userDorm = userRows[0].Dorm;
  const floor = req.params.floor;

  const [rows] = await mysqlConnectionPool.query(`
    SELECT 
      m.Machine_Number, 
      m.Machine_Status, 
      m.Laundry_Room,
      m.Floor, 
      m.Dorm,
      ur.Usage_Status,
      SUM(CASE WHEN qr.Reservation_Status = 'waiting' THEN 1 ELSE 0 END) AS Waiting_Queue_Count
    FROM Machine m
    LEFT JOIN usage_record ur ON m.Machine_ID = ur.Machine_ID
    LEFT JOIN queue_record qr ON m.Machine_ID = qr.Machine_ID
    WHERE m.Floor = ? AND m.Dorm = ?
    GROUP BY m.Machine_ID, m.Machine_Number, m.Machine_Status, m.Laundry_Room, m.Floor, m.Dorm, ur.Usage_Status;`,[floor, userDorm]
  );
  return res.status(200).json(rows);

});
//use_confirm
app.get('/use_confirm', (req, res) =>{
  res.render('use_confirm', {title: '確認使用機台'});
});


//signup
app.get('/signup',(req,res) => {
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
  res.render('login', {title: '登入'});
});

app.post('/login', async (req, res) => {
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

//log out
app.get('/logout', (req,res) =>{
  req.session.destroy();
  res.redirect('/login');

});

//penalty page
app.get('/penalty', async (req,res) => {
    try{
        if(!req.session.user_id){
            return res.redirect('/login');
        }
        const user_id = req.session.user_id;
        // 目前總扣點
        const [pointRows] = await mysqlConnectionPool.query(`
            SELECT IFNULL(SUM(Point),0) AS totalPoint
            FROM Penalty
            WHERE User_ID = ?
        `,[user_id]);
        const totalPoint = pointRows[0].totalPoint;
        // 違規紀錄
        const [records] = await mysqlConnectionPool.query(`
            SELECT *
            FROM Penalty
            WHERE User_ID = ?
            ORDER BY Created_At DESC
        `,[user_id]);
        res.render('penalty',{
            title:'違規紀錄',
            totalPoint,
            records
        });
    }catch(error){
        console.log(error);
        res.send('載入違規紀錄失敗');
    }
});

// maintenance page
app.get('/maintenance', async (req,res) => {
  const [dorms] = await mysqlConnectionPool.query(`
      SELECT DISTINCT Dorm
      FROM machine
      ORDER BY Dorm
  `);
  res.render('maintenance', {
      title:'設備報修',
      dorms
  });
});

// get floor
app.get('/api/floors/:dorm', async (req,res) => {

    const dorm = req.params.dorm;

    const [rows] = await mysqlConnectionPool.query(`
        SELECT DISTINCT Floor
        FROM machine
        WHERE Dorm = ?
        ORDER BY Floor
    `,[dorm]);

    res.json(rows);
});

// get machine name
app.get('/api/machines/:dorm/:floor', async (req,res)=>{

    const dorm = req.params.dorm;
    const floor = req.params.floor;

    const [rows] = await mysqlConnectionPool.query(`
        SELECT Machine_ID, Machine_Number
        FROM machine
        WHERE Dorm = ?
        AND Floor = ?
        AND Machine_Status != '故障中'
    `,[dorm, floor]);

    res.json(rows);
});

// sync maintenance data
app.post('/maintenance', upload.single('photo'), async(req,res) =>{
  console.log("session:", req.session);
  console.log("user_id:", req.session.user_id);
  console.log("body:", req.body);
  try{

        const user_id = req.session.user_id;

        const {
            machine_id,
            issue_type,
            description
        } = req.body;

        const photo = req.file ? req.file.filename : null;

        const final_description =
            issue_type + ' - ' + description;

        await mysqlConnectionPool.query(`
        INSERT INTO Maintenance
        (User_ID, Machine_ID, Description, Request_Time, Photo)
        VALUES (?, ?, ?, NOW(), ?)
        `, [user_id, machine_id, final_description, photo]);

        res.send(`
        <script>
        alert('報修成功！管理員將盡快處理');
        location.href='/';
        </script>
        `);

    } catch(error) {
        console.log(error);
        res.send(`<script>
        alert('報修失敗，請稍後再試');
        history.back();
        </script>
        `);
  }
});

// upload photo
app.use('/maintenance_photo', express.static('maintenance_photo'));


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