/* /lib/mysql.js */
import 'dotenv/config';
import mysql2 from "mysql2/promise";

const mysqlConnectionPool = mysql2.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export default mysqlConnectionPool;

// async function runTest() {
//   const conn = await mysqlConnectionPool.getConnection(); // ← 改名為 conn
//   const result = await conn.query("SELECT * FROM user");
//   console.log(result);
//   conn.release();
//   process.exit();
// }

// runTest();