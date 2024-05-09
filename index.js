import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

dotenv.config();

const corsOptions = [
    'http://localhost:5173',
    'http://localhost:5174',
];

const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(cors({ origin: corsOptions, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

const logger = async (req, res, next) => {
    console.log('called: ', req.hostname, req.originalUrl);
    next();
}

// verify token
const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token;
    console.log('value of the token in the middleware: ', token);
    if (!token) {
        return res.status(401).send({ message: 'Not Authorized!' });
    }
    jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log(err);
            return res.status(401).send({ message: 'Unauthorized Access!' });
        }
        // console.log('value in the token', decoded);
        req.user = decoded;
        next();
    })
}

// MongoDB Codes:

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qmbsuxs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const run = async () => {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        // generating token
        app.post('/jwt', logger, async (req, res) => {
            const user = req.body;
            console.log('token for user: ', user);
            const token = jwt.sign(user, process.env.TOKEN_SECRET, { expiresIn: '72h' });

            res.cookie('token', token, cookieOptions).send({ success: true })
        })

        //clearing token
        app.post("/logout", async (req, res) => {
            const user = req.body;
            console.log("logging out...", user);

            res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).send({ success: true });
        });





        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
    res.send("Server is Running!");
});

app.listen(port, () => {
    console.log(`Server is Running on Port: ${port}`);
});