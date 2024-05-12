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

        const blogCollection = client.db('furryFriendsDB').collection('blogs');
        const commentCollection = client.db('furryFriendsDB').collection('comments');
        const replyCollection = client.db('furryFriendsDB').collection('replies');
        const wishlistCollection = client.db('furryFriendsDB').collection('wishlist');

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

        app.post('/blogs', async (req, res) => {
            console.log((req.body));
            const result = await blogCollection.insertOne(req.body);

            res.send(result);
        })

        app.get('/blogs', async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const sortBy = parseInt(req.query.sort) || 1;
            // console.log(sortBy);
            const result =
                await blogCollection.find()
                    .sort({ posted_on: sortBy })
                    .skip(page * size)
                    .limit(size)
                    .toArray();

            res.send(result);
        })

        app.get('/blogs/:id', async (req, res) => {
            const blog_id = req.params.id;
            const filter = { _id: new ObjectId(blog_id) }
            const result = await blogCollection.findOne(filter);

            res.send(result)
        })

        app.post('/comments', async (req, res) => {
            console.log((req.body));
            const result = await commentCollection.insertOne(req.body);

            res.send(result);
        })

        app.get('/comments/:id', async (req, res) => {
            const filter = { blog_id: req.params.id };
            console.log(filter);
            const result = await commentCollection.find(filter).sort({ commented_on: -1 }).toArray();

            res.send(result);
        })

        // app.put('/comments/:id', async (req, res) => {
        //     const filter = { _id: new ObjectId(req.params.id) };
        //     const updatedComment = req.body;
        //     const options = { upsert: true };
        //     const comment = { $set: { ...updatedComment } };
        //     const result = await commentCollection.updateOne(filter, comment, options)
        // })

        app.post('/replies', async (req, res) => {
            console.log((req.body));
            const result = await replyCollection.insertOne(req.body);

            res.send(result);
        })

        app.get('/replies/:id', async (req, res) => {
            const filter = { comment_id: req.params.id };
            console.log(filter);
            const result = await replyCollection.find(filter).sort({ replied_on: -1 }).toArray();

            res.send(result);
        })

        app.post('/wishlist', async (req, res) => {
            const { blog_id, user_email } = req.body;

            // Check if the blog is already in the wishlist for the user
            const existingEntry = await wishlistCollection.findOne({ blog_id, user_email });

            if (existingEntry) {
                return res.status(409).send({ message: 'Blog is Already in Your Wishlist' });
            }

            const result = await wishlistCollection.insertOne(req.body);

            res.send(result);
        })

        app.get('/wishlist', async (req, res) => {
            const filter = { user_email: req.query.email };
            console.log(filter);
            const result = await wishlistCollection.find(filter).sort({ time_added: -1 }).toArray();

            res.send(result);
        })

        app.post('/wishlist-blogs', async (req, res) => {
            const ids = req.body;
            const wishlistIDs = ids.map(id => new ObjectId(id))

            console.log(wishlistIDs);

            const query = { _id: { $in: wishlistIDs } }
            const result = await blogCollection.find(query).toArray();

            res.send(result);
        })

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