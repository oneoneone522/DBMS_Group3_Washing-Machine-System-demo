// app.js
import * as dotenv from 'dotenv';
dotenv.config();
import express from "express";
import mysqlConnectionPool from "./lib/mysql.js";
import session from 'express-session';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});
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
  secret: process.env.SESSION_SECRET,  
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }   // 本地開發用 false，上線再改 true
}));
app.use(express.static('public'));
app.use(async (req, res, next) => {
  if (req.session.user_id) {
    const [rows] = await mysqlConnectionPool.query(
      `SELECT User_Name FROM User WHERE User_ID = ?`, [req.session.user_id]
    );
    res.locals.user_name = rows[0]?.User_Name ?? null;
  } else {
    res.locals.user_name = null;
  }
  next();
});
app.set('view engine', 'ejs');
app.set('views', './views');

//index
app.get('/', (req, res) => {
  const just_reserved_machine_id = req.session.just_reserved_machine_id || null;
  req.session.just_reserved_machine_id = null; // 讀取後就清除，確保只顯示一次
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
      CASE WHEN ur.Usage_ID IS NULL THEN 'idle' ELSE 'busy' END AS in_use
    FROM Machine m
    LEFT JOIN usage_record ur
      ON m.Machine_ID = ur.Machine_ID AND ur.Usage_Status = 'in_use'
    WHERE m.Dorm = ?
    AND m.Machine_Status != '故障'
  `,[userDorm]
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
      ur.Estimated_End_Time,
      SUM(CASE WHEN qr.Reservation_Status = 'waiting' THEN 1 ELSE 0 END) AS Waiting_Queue_Count
    FROM Machine m
    LEFT JOIN usage_record ur ON m.Machine_ID = ur.Machine_ID
      AND ur.Usage_Status = 'in_use'
    LEFT JOIN queue_record qr ON m.Machine_ID = qr.Machine_ID
    WHERE m.Floor = ? AND m.Dorm = ?
    GROUP BY m.Machine_ID, m.Machine_Number, m.Machine_Status, m.Laundry_Room, m.Floor, m.Dorm, ur.Usage_Status, ur.Estimated_End_Time;`,[floor, userDorm]
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
    `SELECT qr.Machine_ID, qr.Reservation_Number, qr.Reservation_Status, qr.Turn_Start_Time,
            m.Machine_Number, m.Floor, m.Dorm, m.Laundry_Room
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
    // 檢查機器是否真的 idle
    const [machineRows] = await mysqlConnectionPool.query(
      `SELECT in_use FROM Machine WHERE Machine_ID = ?`, [machine_id]
    );
    if (!machineRows[0] || machineRows[0].in_use !== 'idle') {
      return res.status(400).send('此機器目前無法使用');
    }
    // 檢查使用者是否已有進行中的洗衣行程
    const [existingUsage] = await mysqlConnectionPool.query(
      `SELECT Usage_ID FROM usage_record WHERE User_ID = ? AND Usage_Status = 'in_use'`,
      [user_id]
    );
    if (existingUsage.length > 0) {
      return res.status(400).send('你已有進行中的洗衣行程');
    }
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
                    DATE_ADD(NOW(), INTERVAL 30 MINUTE),
              'in_use')`,[user_id, machine_id, user_id, machine_id]
    );
    await mysqlConnectionPool.query(
      `UPDATE Machine SET in_use = 'busy' WHERE Machine_ID = ?`, [machine_id]
    );

    await mysqlConnectionPool.query(
      `UPDATE queue_record
      SET Reservation_Status = 'completed'
      WHERE User_ID = ? AND Machine_ID = ? AND Reservation_Status = 'waiting'`, [user_id, machine_id]
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
        `UPDATE machine SET in_use = 'idle' WHERE Machine_ID = ?`, [machine_id]
        );
        await mysqlConnectionPool.query(
          `UPDATE usage_record SET Usage_Status = 'finished' WHERE Usage_ID = ?`, [usage_id]
        );
        await mysqlConnectionPool.query(
          `UPDATE queue_record
          SET Reservation_Number = Reservation_Number - 1
          WHERE Machine_ID = ? AND Reservation_Status = 'waiting' AND Reservation_Number > 0`, [machine_id]
        );
        // 設定新一位排隊者的「輪到你」計時起點（過號判定用）
        await mysqlConnectionPool.query(
          `UPDATE queue_record
           SET Turn_Start_Time = NOW()
           WHERE Machine_ID = ? AND Reservation_Status = 'waiting' AND Reservation_Number = 0`,
          [machine_id]
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
  try {
    const [rows] = await mysqlConnectionPool.query('SELECT DORM_NAME FROM DORM');
    if (rows.length > 0) {
      return res.status(200).json(rows);
    }
    // DORM table 是空的，改從 User table 抓現有宿舍
    const [userRows] = await mysqlConnectionPool.query('SELECT DISTINCT Dorm AS DORM_NAME FROM User ORDER BY Dorm');
    return res.status(200).json(userRows);
  } catch (err) {
    // DORM table 不存在，從 User table 抓
    const [userRows] = await mysqlConnectionPool.query('SELECT DISTINCT Dorm AS DORM_NAME FROM User ORDER BY Dorm');
    return res.status(200).json(userRows);
  }
});
app.post("/signup", async (req, res) => {
  const { dorm, user_name, student_id, room_number, email, password, confirm_password } = req.body;

  if (password !== confirm_password) {
    return res.render('signup', { title: '註冊', error: '兩次密碼輸入不一致' });
  }

  try {
    await mysqlConnectionPool.query(
      "INSERT INTO User (Dorm, User_Name, Student_ID, Room_Number, Email, Password) VALUES (?, ?, ?, ?, ?, ?)",
      [dorm, user_name, student_id, room_number, email, password]
    );
    res.redirect('/login');
  } catch (err) {
    console.error('[signup error]', err.code, err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.render('signup', { title: '註冊', error: '此 Email 或學號已被註冊過' });
    }
    return res.render('signup', { title: '註冊', error: '註冊失敗，請稍後再試' });
  }
});

//login
app.get('/login', (req, res) => {
  const reset = req.query.reset === '1';
  res.render('login', { title: '登入', error: null, reset });
});

app.post('/login', async (req, res) => {

  const { email, password } = req.body;
  const [rows] = await mysqlConnectionPool.query(
    "SELECT User_ID, Password FROM User WHERE Email = ?",
    [email]
  );

  if (rows.length === 0 || rows[0].Password !== password) {
    return res.render('login', { title: '登入', error: '帳號或密碼錯誤', reset: false });
  }
  req.session.user_id = rows[0].User_ID;
  res.redirect('/');
});

//forgot password
app.get('/forgot-password', (req, res) => {
  const sent = req.query.sent === '1';
  console.log("forgot-password, sent:", sent);
  res.render('forgot_password', { title: '忘記密碼', sent });
});

app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const [rows] = await mysqlConnectionPool.query(
      'SELECT User_ID FROM User WHERE Email = ?', [email]
    );

    if (rows.length > 0) {
      const user_id = rows[0].User_ID;
      const token = crypto.randomBytes(32).toString('hex');
      const expires_at = new Date(Date.now() + 60 * 60 * 1000);

      await mysqlConnectionPool.query(
        'DELETE FROM password_reset_tokens WHERE User_ID = ?', [user_id]
      );
      await mysqlConnectionPool.query(
        'INSERT INTO password_reset_tokens (User_ID, token, expires_at) VALUES (?, ?, ?)',
        [user_id, token, expires_at]
      );

      const resetUrl = `http://localhost:3000/reset-password/${token}`;
      await transporter.sendMail({
        from: `"洗衣系統" <${process.env.MAIL_USER}>`,
        to: email,
        subject: '密碼重設連結',
        html: `
          <p>你好，</p>
          <p>請點擊以下連結重設密碼（連結 1 小時內有效）：</p>
          <a href="${resetUrl}">${resetUrl}</a>
          <p>如果你沒有申請重設密碼，請忽略此信。</p>
        `,
      });
    }
  } catch (err) {
    console.error('[forgot-password error]', err);
  }

  return res.redirect('/forgot-password?sent=1');
});

//reset password
app.get('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const [rows] = await mysqlConnectionPool.query(
    'SELECT * FROM password_reset_tokens WHERE token = ? AND expires_at > NOW() AND used = FALSE',
    [token]
  );
  const valid = rows.length > 0;
  res.render('reset_password', { title: '重設密碼', token, valid, error: null });
});

app.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password, confirm_password } = req.body;

  const [rows] = await mysqlConnectionPool.query(
    'SELECT * FROM password_reset_tokens WHERE token = ? AND expires_at > NOW() AND used = FALSE',
    [token]
  );

  if (rows.length === 0) {
    return res.render('reset_password', { title: '重設密碼', token, valid: false, error: null });
  }
  if (password !== confirm_password) {
    return res.render('reset_password', { title: '重設密碼', token, valid: true, error: '兩次密碼輸入不一致' });
  }

  await mysqlConnectionPool.query('UPDATE User SET Password = ? WHERE User_ID = ?', [password, rows[0].User_ID]);
  await mysqlConnectionPool.query('UPDATE password_reset_tokens SET used = TRUE WHERE token = ?', [token]);

  return res.redirect('/login?reset=1');
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

app.get('/api/notifications', async (req, res) => {
  if (!req.session.user_id) {
    return res.status(401).json([]);
  }

  try {
    const user_id = req.session.user_id;

    // 1. 通知正在使用的人：洗衣剩餘10秒
    const [usageRows] = await mysqlConnectionPool.query(`
      SELECT Usage_ID, User_ID
      FROM usage_record
      WHERE User_ID = ?
        AND Usage_Status = 'in_use'
        AND TIMESTAMPDIFF(SECOND, NOW(), Estimated_End_Time) BETWEEN 8 AND 10
    `, [user_id]);

    for (const usage of usageRows) {
      const [existing] = await mysqlConnectionPool.query(`
        SELECT Notification_ID
        FROM notifications
        WHERE User_ID = ?
          AND Usage_ID = ?
          AND Notification_Type = '洗衣剩餘10秒'
      `, [user_id, usage.Usage_ID]);

      if (existing.length === 0) {
        await mysqlConnectionPool.query(`
          INSERT INTO notifications
          (User_ID, Queue_ID, Usage_ID, Notification_Type, Notification_Time)
          VALUES (?, NULL, ?, '洗衣剩餘10秒', NOW())
        `, [user_id, usage.Usage_ID]);
      }
    }

    // 2. 通知排隊第一位的人：前一位快洗好了
    const [queueRows] = await mysqlConnectionPool.query(`
      SELECT 
        qr.Queue_ID,
        qr.User_ID,
        qr.Machine_ID,
        ur.Usage_ID
      FROM usage_record ur
      JOIN queue_record qr ON ur.Machine_ID = qr.Machine_ID
      WHERE ur.Usage_Status = 'in_use'
        AND qr.Reservation_Status = 'waiting'
        AND qr.Reservation_Number = 1
        AND TIMESTAMPDIFF(SECOND, NOW(), ur.Estimated_End_Time) BETWEEN 8 AND 10
    `);

    for (const queue of queueRows) {
      const [existing] = await mysqlConnectionPool.query(`
        SELECT Notification_ID
        FROM notifications
        WHERE User_ID = ?
          AND Queue_ID = ?
          AND Usage_ID = ?
          AND Notification_Type = '即將輪到你使用洗衣機'
      `, [queue.User_ID, queue.Queue_ID, queue.Usage_ID]);

      if (existing.length === 0) {
        await mysqlConnectionPool.query(`
          INSERT INTO notifications
          (User_ID, Queue_ID, Usage_ID, Notification_Type, Notification_Time)
          VALUES (?, ?, ?, '即將輪到你使用洗衣機', NOW())
        `, [queue.User_ID, queue.Queue_ID, queue.Usage_ID]);
      }
    }

    // 3. 洗衣結束前 10 分鐘寄送 Email 提醒
    const [emailRows] = await mysqlConnectionPool.query(`
      SELECT ur.Usage_ID, u.Email, u.User_Name,
             m.Machine_Number, m.Dorm, m.Floor, m.Laundry_Room,
             ur.Estimated_End_Time
      FROM usage_record ur
      JOIN User u  ON ur.User_ID  = u.User_ID
      JOIN Machine m ON ur.Machine_ID = m.Machine_ID
      WHERE ur.User_ID = ?
        AND ur.Usage_Status = 'in_use'
        AND TIMESTAMPDIFF(MINUTE, NOW(), ur.Estimated_End_Time) BETWEEN 9 AND 11
    `, [user_id]);

    for (const row of emailRows) {
      const [already] = await mysqlConnectionPool.query(`
        SELECT Notification_ID FROM notifications
        WHERE User_ID = ? AND Usage_ID = ? AND Notification_Type = '洗衣結束前10分鐘提醒'
      `, [user_id, row.Usage_ID]);

      if (already.length === 0) {
        // 寫入通知紀錄（避免重複寄）
        await mysqlConnectionPool.query(`
          INSERT INTO notifications (User_ID, Queue_ID, Usage_ID, Notification_Type, Notification_Time)
          VALUES (?, NULL, ?, '洗衣結束前10分鐘提醒', NOW())
        `, [user_id, row.Usage_ID]);

        // 寄 Email
        const endTime = new Date(row.Estimated_End_Time).toLocaleString('zh-TW');
        await transporter.sendMail({
          from: `"洗衣系統" <${process.env.MAIL_USER}>`,
          to: row.Email,
          subject: '【洗衣提醒】您的洗衣即將結束',
          html: `
            <p>您好，${row.User_Name}，</p>
            <p>您在 <strong>${row.Dorm} ${row.Floor}F・${row.Laundry_Room}・${row.Machine_Number} 號機</strong>
               的洗衣程序將於 <strong>${endTime}</strong> 結束（約剩 10 分鐘）。</p>
            <p>請記得及時取回衣物，以免影響其他同學使用。</p>
            <br>
            <p style="color:#888;font-size:12px;">— 宿舍洗衣機管理系統</p>
          `,
        }).catch(err => console.error('[email 寄送失敗]', err.message));
      }
    }

    // 4. 過號判定：排到 #0 但超過 5 分鐘未掃碼 → 扣點並取消
    const [overdueQueues] = await mysqlConnectionPool.query(`
      SELECT qr.Queue_ID, qr.User_ID, qr.Machine_ID
      FROM queue_record qr
      WHERE qr.Reservation_Status = 'waiting'
        AND qr.Reservation_Number = 0
        AND qr.Turn_Start_Time IS NOT NULL
        AND TIMESTAMPDIFF(MINUTE, qr.Turn_Start_Time, NOW()) >= 5
    `);

    for (const queue of overdueQueues) {
      // 標記為過號
      await mysqlConnectionPool.query(
        `UPDATE queue_record SET Reservation_Status = 'missed' WHERE Queue_ID = ?`,
        [queue.Queue_ID]
      );
      // 其餘排隊者號碼遞減
      await mysqlConnectionPool.query(
        `UPDATE queue_record
         SET Reservation_Number = Reservation_Number - 1
         WHERE Machine_ID = ? AND Reservation_Status = 'waiting' AND Reservation_Number > 0`,
        [queue.Machine_ID]
      );
      // 設定新一位的計時
      await mysqlConnectionPool.query(
        `UPDATE queue_record
         SET Turn_Start_Time = NOW()
         WHERE Machine_ID = ? AND Reservation_Status = 'waiting' AND Reservation_Number = 0`,
        [queue.Machine_ID]
      );
      // 寫入違規紀錄（扣 1 點）
      await mysqlConnectionPool.query(
        `INSERT INTO Penalty (User_ID, Penalty_Type, Point, Created_At)
         VALUES (?, '過號未使用', 1, NOW())`,
        [queue.User_ID]
      );
      // 寫入通知讓該使用者知道自己被過號
      await mysqlConnectionPool.query(
        `INSERT INTO notifications (User_ID, Queue_ID, Usage_ID, Notification_Type, Notification_Time)
         VALUES (?, ?, NULL, '您已過號，已扣除 1 點', NOW())`,
        [queue.User_ID, queue.Queue_ID]
      );
    }

    // 4. 回傳目前登入者的通知紀錄
    const [notifications] = await mysqlConnectionPool.query(`
      SELECT Notification_ID, User_ID, Queue_ID, Usage_ID, Notification_Type, Notification_Time
      FROM notifications
      WHERE User_ID = ?
      ORDER BY Notification_Time DESC
      LIMIT 20
    `, [user_id]);

    res.json(notifications);

  } catch (error) {
    console.error(error);
    res.status(500).json([]);
  }
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