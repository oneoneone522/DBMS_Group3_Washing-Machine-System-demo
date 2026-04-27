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
app.use(express.static('public'));

app.set('view engine', 'ejs');
app.set('views', './views');

//index
app.get('/', (req, res) => {
  const just_reserved_machine_id = req.session.just_reserved_machine_id || null;
  req.session.just_reserved_machine_id = null; // 讀取後就清除，確保只顯示一次
  // req.session.just_finished_machine_id = null;
  res.render('index',{ title: '使用狀態' , just_reserved_machine_id, machine_id: just_reserved_machine_id });
});

app.get('/api/check-login', (req, res) => {
  if (req.session.user_id) {
    return res.json({ logged_in: true });
  }
  return res.json({ logged_in: false });
});

//current_usage
app.get('/api/current_usage', async (req, res) => {
  if (!req.session.user_id) {
    return res.status(401).json({ message: "請先登入" });
  }
  const [rows] = await mysqlConnectionPool.query(
    `SELECT ur.Usage_ID, 
            ur.Usage_Status, 
            ur.Machine_ID, 
            ur.Estimated_End_Time,
            m.Machine_Number, 
            m.Floor, m.Dorm, 
            m.Laundry_Room
     FROM Usage_Record ur
     JOIN Machine m ON ur.Machine_ID = m.Machine_ID
     WHERE ur.User_ID = ? AND ur.Usage_Status = 'in_use'`,[req.session.user_id]
  );
  return res.status(200).json(rows[0] ?? null);
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
      m.in_use
    FROM Machine m
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
      m.Machine_ID,
      m.Machine_Number, 
      m.Machine_Status, 
      m.Laundry_Room,
      m.Floor, 
      m.Dorm,
      m.in_use,
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
// queue function
app.post('/api/queue/:machine_id',async (req, res) => {
  const machine_id = req.params.machine_id;
  const user_id = req.session.user_id;

  const[existingQueue] = await mysqlConnectionPool.query(
    `SELECT * FROM queue_record
    WHERE User_ID = ? AND Machine_ID = ? AND Reservation_Status = 'waiting';`,[user_id, machine_id]
  );
  if (existingQueue.length > 0) {
    return res.status(400).json({ message: "你已經在排隊中" });
  }

  await mysqlConnectionPool.query(
    `
  INSERT INTO queue_record (User_ID, Machine_ID, Reservation_Number, Reservation_Status)
  VALUES (
    ?,
    ?,
    (SELECT next_num FROM
      (SELECT CASE WHEN MAX(Reservation_Number) IS NULL
                    THEN 1
                    ELSE MAX(Reservation_Number) + 1
              END AS next_num
        FROM queue_record
        WHERE Machine_ID = ? AND Reservation_Status = 'waiting'
      ) AS temp
    ),
    'waiting'
   );`,
    [user_id, machine_id, machine_id]
  );

  return res.status(200).json({ message: "成功加入排隊" });
});

//my queue
app.get('/api/my_queue', async (req, res) => {
  if (!req.session.user_id) {
    return res.status(401).json({ message: "請先登入" });
  }
  const user_id = req.session.user_id;
  const [rows] = await mysqlConnectionPool.query(
    `SELECT qr.Machine_ID, qr.Reservation_Number, m.Machine_Number, m.Floor, m.Dorm, m.Laundry_Room
    FROM queue_record qr
    LEFT JOIN Machine m ON qr.Machine_ID = m.Machine_ID
    WHERE qr.User_ID = ? AND qr.Reservation_Status = 'waiting'`, [user_id]
  );
  return res.status(200).json(rows[0] ?? null);
});

//cancel queue
app.post ('/api/cancel_queue/:machine_id', async (req, res) => {
  if (!req.session.user_id) {
    return res.status(401).json({ message: "請先登入" });
  }
  const machine_id = req.params.machine_id;
  const user_id = req.session.user_id;

  await mysqlConnectionPool.query(
    `UPDATE queue_record
    SET Reservation_Status = 'cancelled'
    WHERE User_ID = ? AND Machine_ID = ? AND Reservation_Status = 'waiting'`, [user_id, machine_id]
  );
  await mysqlConnectionPool.query(
    `UPDATE queue_record
    SET Reservation_Number = Reservation_Number - 1
    WHERE Machine_ID = ? AND Reservation_Status = 'waiting' AND Reservation_Number > 0`, [machine_id]
  );
  //await fetch(...) 會等到收到 HTTP Response 才繼續往下執行
  return res.status(200).json({ message: "成功取消排隊" }
  );
});

//scan qr code
app.get('/scan_qr', (req, res) => {
  if (!req.session.user_id) {
    return res.redirect('/login');
  }
  if (!req.query.machine_id) {
    return res.status(400).json({ message: "缺少 machine_id 參數" });
  }
  res.render('qr_scan', 
    { title: '掃碼使用' ,
      expected_machine_id: req.query.machine_id
    });
});

//Use Mahcine
app.get('/use_machine/:machine_id', async (req, res) => {
  if (!req.session.user_id) {
    return res.redirect('/login');
  }
  const machine_id = req.params.machine_id;
  const user_id = req.session.user_id;
  try {
    await mysqlConnectionPool.query(
      `INSERT INTO usage_record (User_ID, Machine_ID, Queue_ID, Estimated_End_Time,Usage_Status) 
      VALUES (?, 
              ?, 
              (SELECT Queue_ID 
              FROM queue_record
              WHERE User_ID = ? 
                    AND Machine_ID = ? 
                    AND Reservation_Status = 'waiting' 
                    ORDER BY Reservation_Number LIMIT 1),
                    DATE_ADD(NOW(), INTERVAL 1 MINUTE),
              'in_use')`,[user_id, machine_id, user_id, machine_id]
    );
    await mysqlConnectionPool.query(
      `UPDATE Machine SET in_use = 'busy' WHERE Machine_ID = ?`, [machine_id]
    );

    req.session.just_reserved_machine_id = machine_id;
    return res.redirect(`/`);
  }
  catch (error) {
    console.error(error);
    return res.status(500).send('伺服器錯誤');
  }
});

//Finish using machine
app.post('/api/finished/:usage_id', async (req, res) => {
  if (!req.session.user_id) {
    return res.redirect('/login');
  }
  const usage_id = req.params.usage_id;
  
  try {
        const [rows] = await mysqlConnectionPool.query(
        `SELECT Machine_ID FROM usage_record WHERE Usage_ID = ?`, [usage_id]
        );
        const machine_id = rows[0].Machine_ID;
        await mysqlConnectionPool.query(
        `UPDATE MACHINE SET in_use = 'idle' WHERE Machine_ID = ?`, [machine_id]
        );
        await mysqlConnectionPool.query(
          `UPDATE usage_record SET Usage_Status = 'finished' WHERE Machine_ID = ?`, [machine_id]
        );
        await mysqlConnectionPool.query(
          `UPDATE queue_record
          SET Reservation_Number = Reservation_Number - 1
          WHERE Machine_ID = ? AND Reservation_Status = 'waiting' AND Reservation_Number > 0`, [machine_id]
        );
        return res.status(200).json({message: "洗衣完成！"});
  }
  catch (error) {
    console.error(error);
    return res.status(500).send('伺服器錯誤');
  }
  
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