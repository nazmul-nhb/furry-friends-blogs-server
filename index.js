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
    'https://furry-friends-dcbd4.web.app',
    'https://furry-friends-dcbd4.firebaseapp.com',
    'https://furry-friends-blogs-nhb.vercel.app',
    'https://furry-friends-blogs-nhb-nazmul-hassans-projects.vercel.app'
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

// const logger = async (req, res, next) => {
//     console.log('called: ', req.hostname, req.originalUrl);
//     next();
// }

// verify token
const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token;
    console.log('value of the token in the middleware: ', token);
    if (!token) {
        return res.status(401).send({ message: 'Not Authorized!' });
    }
    jwt.verify(token, process.env.TOKEN_SECRET, (error, decoded) => {
        if (error) {
            console.log(error);
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
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            console.log('token for user: ', user);
            const token = jwt.sign(user, process.env.TOKEN_SECRET, { expiresIn: '72h' });

            res.cookie('token', token, cookieOptions).send({ success: true })
        })

        // clearing token
        app.post("/logout", async (req, res) => {
            const user = req.body;
            console.log("logging out...", user);

            res.clearCookie('token', { ...cookieOptions, maxAge: 0 }).send({ success: true });
        });

        // add blog
        app.post('/blogs', async (req, res) => {
            // console.log((req.body));
            const result = await blogCollection.insertOne(req.body);

            res.send(result);
        })

        // blogs count with optional category & search filter
        app.get('/blogs-count', async (req, res) => {
            const category = req.query.category ? req.query.category.trim() : '';
            const searchText = req.query.search ? req.query.search.trim() : '';
            let filter = {};

            if (category) {
                filter.category = category;
            }

            if (searchText) {
                filter.blog_title = { $regex: searchText, $options: "i" };
            }

            const count = await blogCollection.countDocuments(filter);

            res.send({ count })
        })

        // get blogs in array with sort, pagination, fixed number of blogs and search functionalities
        app.get("/blogs", async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const sortBy = parseInt(req.query.sort) || 1;
            const currentUser = req.query.currentUser;

            let filter = {};
            if (req.query.category !== "" && req.query.category && req.query.category.trim() !== "") {
                filter.category = req.query.category;
            }
            if (req.query.search) {
                filter.blog_title = { $regex: req.query.search, $options: "i" };
            }
            if (currentUser && currentUser !== '') {
                filter.blogger_email = currentUser;
            }

            // console.log(filter);

            const result = await blogCollection
                .find(filter)
                .sort({ posted_on: sortBy })
                .skip(page * size)
                .limit(size)
                .project({ long_description: 0 })
                .toArray();

            res.send(result);
        });

        // get single blog
        app.get('/blog/:id', verifyToken, async (req, res) => {
            const blog_id = req.params.id;
            const filter = { _id: new ObjectId(blog_id) }
            const result = await blogCollection.findOne(filter);

            res.send(result)
        })

        // update single blog
        app.patch('/blog/:id', async (req, res) => {
            const filter = { _id: new ObjectId(req.params.id) };
            const updatedBlog = req.body;
            // console.log(updatedBlog);
            const options = { upsert: true };
            const blog = { $set: { ...updatedBlog } };
            const result = await blogCollection.updateOne(filter, blog, options)

            res.send(result)
        })

        // top 10 featured blogs
        app.get('/featured-blogs', async (req, res) => {
            const blog = {
                blog_title: 1, posted_on: 1, posted_by: 1, blogger_photo: 1, blogger_email: 1, image: 1,
                // confused: which one to use : total characters or word count !!!
                total_characters: { $strLenCP: "$long_description" },
                word_count: { $size: { $split: ["$long_description", " "] } }
            }
            const newBlogs = await blogCollection
                .aggregate([{ $project: blog }, { $sort: { word_count: -1 } }, { $limit: 10 }]).toArray();

            const result = newBlogs.map((newBlog, index) => ({ ...newBlog, serial: index + 1 }));

            res.send(result);
        })

        // add comments
        app.post('/comments', async (req, res) => {
            // console.log((req.body));
            const result = await commentCollection.insertOne(req.body);

            res.send(result);
        })

        // get comments filtered by blog id and user email
        app.get('/comments/:id', verifyToken, async (req, res) => {
            const filter = { blog_id: req.params.id };
            // console.log(filter);
            const result = await commentCollection.find(filter).sort({ commented_on: -1 }).toArray();

            res.send(result);
        })

        // update comment : will do after getting assignment result
        // app.put('/comments/:id', async (req, res) => {
        //     const filter = { _id: new ObjectId(req.params.id) };
        //     const updatedComment = req.body;
        //     const options = { upsert: true };
        //     const comment = { $set: { ...updatedComment } };
        //     const result = await commentCollection.updateOne(filter, comment, options)
        // })

        // add reply
        app.post('/replies', async (req, res) => {
            // console.log((req.body));
            const result = await replyCollection.insertOne(req.body);

            res.send(result);
        })

        // get replies filtered by comment id and user email
        app.get('/replies/:id', verifyToken, verifyToken, async (req, res) => {
            const filter = { comment_id: req.params.id };
            // console.log(filter);
            const result = await replyCollection.find(filter).sort({ replied_on: -1 }).toArray();

            res.send(result);
        })

        // add blog id to wishlist with user email and blog id
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

        // get wishlist blog ids in array filtered by user email
        app.get('/wishlist', verifyToken, async (req, res) => {
            // match user
            if (req.query?.email !== req.user.email) {
                return res.status(403).send({ message: 'Forbidden Access!' })
            }

            const filter = { user_email: req.query.email };
            // console.log(filter);
            const result = await wishlistCollection.find(filter).toArray();

            res.send(result);
        })

        // delete blog id from wishlist filtered by user email
        app.delete('/wishlist/:id', async (req, res) => {
            const query = { user_email: req.query.email, blog_id: req.params.id };
            // const query = { _id: new ObjectId(delete_id) };
            const result = await wishlistCollection.deleteOne(query);

            res.send(result)
        })

        // get full blog for each id from wishlist with a post request filtered by blog id
        app.post('/wishlist-blogs', verifyToken, async (req, res) => {
            const ids = req.body;
            const wishlistIDs = ids.map(id => new ObjectId(id));

            // console.log(wishlistIDs);

            const query = { _id: { $in: wishlistIDs } };
            const result = await blogCollection.find(query).sort({ blog_title: 1 }).toArray();

            res.send(result);
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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