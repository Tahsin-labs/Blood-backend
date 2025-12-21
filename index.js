const express = require('express');
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
const port = process.env.PORT || 3000
const stripe = require('stripe')(process.env.STRIPE_SECRATE);
const crypto = require('crypto');
const app = express();
app.use(cors());
app.use(express.json())


const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


// token secure part 

const verifyFBToken = async (req, res, next) => {
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).send({ massage: 'unauthorize access' })
    }
    try {
        const idToken = token.split(' ')[1]
        const decoded = await admin.auth().verifyIdToken(idToken)
        console.log("decoded info ", decoded)
        req.decoded_email = decoded.email;
        next();
    }
    catch (error) {
        return res.status(401).send({ massage: 'unauthorize access' })
    }

}








// from mongo db



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
        const requestCollection = database.collection('request')

        app.post('/users', async (req, res) => {
            console.log(req.body)
            const userInfo = req.body;
            userInfo.role = "donor";
            userInfo.status = 'active'
            userInfo.createdAt = new Date();
            console.log(userInfo)
            const result = await userCollection.insertOne(userInfo);
            res.send(result)
        })


        app.get('/users', verifyFBToken, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.status(200).send(result)
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


        app.patch('/update/user/status', verifyFBToken, async (req, res) => {
            try {
                const { email, status } = req.query;

                if (!email || !status) {
                    return res.status(400).send({ error: "Email and status are required" });
                }

                const query = { email: email };
                const updateStatus = {
                    $set: { status: status }
                };

                const result = await userCollection.updateOne(query, updateStatus);
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: "Failed to update user status" });
            }
        });


        app.get('/my-request', verifyFBToken, async (req, res) => {
            const email = req.decoded_email;
            // const limit =Number( req.query.limit)
            // const skip =Number( req.query.skip)
            const size = Number(req.query.size)
            const page = Number(req.query.page)
            const query = { email: email };
            const result = await requestCollection.find(query)
                .limit(size)
                .skip(size * page)
                // .limit(skip)
                .toArray();

            const totalRequest = await requestCollection.countDocuments(query);
            res.send({ request: result, totalRequest })
        })



        //    payment 

        app.post('/create-payment-checkout', async (req, res) => {
            const information = req.body;
            const amount = parseInt(information.donateAmount) * 100;
            const session = await stripe.checkout.sessions.create({

                line_items: [
                    {

                        price_data: {
                            currency: 'usd',
                            unit_amount: amount,
                            product_data:{
                                name:'please Donate'
                            }
                        },

                        quantity: 1,
                    },
                ],
                mode: 'payment',
                metadata: {
                    donorName: information?.donorName,
                },
                customer_email: information?.donorEmail,
                success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,

                 cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,


            });
        
            res.send({url:session.url})




        })








        // app.get('/user/:email', async(req,res)=>{
        //     const email = req.params.email
        //     const query= {email:email}
        //     const result = await userCollection.findOne(query);
        //     res.send(result)
        // })

        //  product

        app.post('/request', verifyFBToken, async (req, res) => {
            const data = req.body;
            // req.destroy_email
            const result = await requestCollection.insertOne(data)
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