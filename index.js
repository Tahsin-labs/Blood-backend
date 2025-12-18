const express = require('express');
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 3000


const app = express();
app.use(cors());
app.use(express.json())

// from mongo db


const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://Blood-Baskend:6WDk7VgSasIE61JU@cluster0.be4pazl.mongodb.net/?appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();



        const database = client.db('blood-projects')
        const userCollection = database.collection('user')

        app.post('/users', async (req, res) => {
            console.log(req.body)
            const userInfo = req.body;
            userInfo.role = "douner";
            userInfo.createdAt = new Date();
            const result = await userCollection.insertOne(userInfo);
            res.send(result)
        })


        //   to find the role

        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const result = await userCollection.findOne(query)
            console.log(result);
            console.log(query)
            res.send(result)


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



app.get('/', (req, res) => {
    res.send("Hello Blood")
})

app.listen(port, () => {
    console.log(`server is running on ${port}`);
})