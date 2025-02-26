const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://task-management00.web.app/",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h13ev.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let TaskCollection;

async function run() {
  try {
    await client.connect();
    // console.log(" Connected to MongoDB!");

    const db = client.db("TaskDB");
    TaskCollection = db.collection("Task");

    io.on("connection", (socket) => {
      // console.log(" Socket.io Client Connected!");

      socket.on("newTask", async (task) => {
        const result = await TaskCollection.insertOne(task);
        if (result.insertedId) {
          io.emit("newTask", { _id: result.insertedId, ...task });
        }
      });

      socket.on("updateTask", async (task) => {
        const { _id, title, description, category } = task;

        const filter = { _id: new ObjectId(_id) };
        const updateDoc = {
          $set: {
            ...(title && { title }),
            ...(description && { description }),
            ...(category && { category }),
          },
        };

        const result = await TaskCollection.updateOne(filter, updateDoc);
        if (result.modifiedCount > 0) {
          const updatedTask = await TaskCollection.findOne(filter);
          io.emit("taskUpdated", updatedTask);
        }
      });

      socket.on("deleteTask", async (taskId) => {
        const result = await TaskCollection.deleteOne({
          _id: new ObjectId(taskId),
        });
        if (result.deletedCount > 0) {
          io.emit("taskDeleted", { _id: taskId });
        }
      });

      socket.on("disconnect", () => {
        // console.log(" Socket.io Client Disconnected");
      });
    });

    server.listen(port, () => {
      // console.log(` Server running on port ${port}`);
    });
  } catch (error) {
    console.error(" Error:", error);
  }
}
run().catch(console.dir);

// ---------------------- API Routes ----------------------------

// Add New Task
app.post("/task", async (req, res) => {
  const task = req.body;
  const result = await TaskCollection.insertOne(task);
  res.send(result);

  io.emit("newTask", { _id: result.insertedId, ...task });
});

// Get All Tasks
app.get("/task", async (req, res) => {
  const tasks = await TaskCollection.find().toArray();
  res.send(tasks);
});

// Get Single Task
app.get("/task/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid Task ID" });
  }

  const task = await TaskCollection.findOne({ _id: new ObjectId(id) });
  if (task) {
    res.send(task);
  } else {
    res.status(404).send({ message: "Task not found" });
  }
});

// ---------------------- Update Task (Title, Description & Category) ----------------------------
app.put("/task/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description, category } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid Task ID" });
  }

  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      ...(title && { title }),
      ...(description && { description }),
      ...(category && { category }),
    },
  };

  try {
    const result = await TaskCollection.updateOne(filter, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Task not found" });
    }

    const updatedTask = await TaskCollection.findOne(filter);
    io.emit("taskUpdated", updatedTask);

    res.status(200).send(updatedTask);
  } catch (error) {
    res.status(500).send({ message: "Error updating task", error });
  }
});

// Delete Task
app.delete("/task/:id", async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid Task ID" });
  }

  const result = await TaskCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount > 0) {
    io.emit("taskDeleted", { _id: id });
  }

  res.send(result);
});

// Root Route
app.get("/", (req, res) => {
  res.send(" Task Management API Running...");
});
