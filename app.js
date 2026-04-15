// app.js
import express from "express";

const app = express();

app.get("/ping", (req, res) => {
  return res.send("<h1>Pong!</h1>");
});

app.listen(3000, () => {
  console.log("Server starts at port 3000");
});