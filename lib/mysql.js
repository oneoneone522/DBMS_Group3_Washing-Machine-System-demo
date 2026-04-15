/* /lib/mysql.js */
import mysql2 from "mysql2/promise";

const access = {
  user: "root", // write your username
  password: "rizeismywife522", // write your password
  database: "dbms-example", // write your database
};
const mysqlConnectionPool = mysql2.createPool(access);

export default mysqlConnectionPool;

async function runTest() {
  const mysql = await mysqlConnectionPool.getConnection();
  const result = await mysql.query("SELECT * FROM user");
  console.log(result);
  process.exit();
}

runTest();