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



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.be4pazl.mongodb.net/?appName=Cluster0`;

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
        // await client.connect();



        const database = client.db('blood-projects')
        const userCollection = database.collection('user')
        const requestCollection = database.collection('request')
        const paymentCollection = database.collection('payment')

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
                            product_data: {
                                name: 'please Donate'
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

            res.send({ url: session.url })


        })



        // app.post('/success-payment', async(req,res)=>{
        //     const {session_Id} =req.query;
        //     const session = await stripe.checkout.sessions.retrieve(session_Id);
        //     console.log(session);

        // })




        // app.post("/success-payment", async (req, res) => {
        //     try {
        //         const { session_id } = req.query;

        //         if (!session_id) {
        //             return res.status(400).json({ error: "Session ID missing" });
        //         }

        //         const session = await stripe.checkout.sessions.retrieve(session_id);

        //         console.log("STRIPE SESSION:", session);

        //         res.json({
        //             success: true,
        //             status: session.payment_status,
        //         });
        //     } catch (error) {
        //         console.error(error.message);
        //         res.status(500).json({ error: error.message });
        //     }

        // const transactionId=session.payment_intent;

        // if(session.payment_status =='paid'){
        //     const payment_Info={
        //         amount:session.amount_total/100,
        //         currency:session.currency,
        //         donorEmail:session.customer_email,
        //         transactionId,
        //         payment_status:session.payment_status,
        //         paidAt: new data()


        //     }
        //     const result =await paymentCollection.insertOne(payment_Info)
        //     return res.send(result)

        // }

        // });



        app.post("/success-payment", async (req, res) => {
            try {
                const { session_id } = req.query;

                if (!session_id) {
                    return res.status(400).json({ error: "Session ID missing" });
                }

                const session = await stripe.checkout.sessions.retrieve(session_id);

                console.log("STRIPE SESSION:", session);


                if (session.payment_status === "paid") {
                    const payment_Info = {
                        amount: session.amount_total / 100,
                        currency: session.currency,
                        donorEmail: session.customer_email,
                        transactionId: session.payment_intent,
                        payment_status: session.payment_status,
                        paidAt: new Date(),
                    };

                    const result = await paymentCollection.insertOne(payment_Info);

                    return res.status(200).json({
                        success: true,
                        message: "Payment saved successfully",
                        insertedId: result.insertedId,
                    });
                }


                return res.status(400).json({
                    success: false,
                    message: "Payment not completed",
                });

            } catch (error) {
                console.error("PAYMENT ERROR:", error.message);
                res.status(500).json({ error: error.message });
            }
        });



        //   get for search 

        // app.get('/search-request', async (req, res) => {
        //     const { bloodGroup, district, upazila } = req.query;

        //     const query = {};

        //     if (!query) {
        //         return;
        //     }
        //     if (bloodGroup) {
        //         const fixed = bloodGroup.replace(/ /g, "+").trim();
        //         query.bloodGroup = fixed;
        //     }
        //     if (district) {
        //         query.district = district;
        //     }
        //     if (upazila) {
        //         query.upazilas = upazila
        //     }
        //     console.log(query)
        // })



app.get('/search-request', async (req, res) => {
    try {
        const { bloodGroup, district, upazila } = req.query;
        const query = {};

        if (bloodGroup) {
            query.bloodGroup = bloodGroup;
        }
        if (district) {
            query.district = district;
        }
        if (upazila) {
            query.upazilas = upazila; 
        }

        console.log("SEARCH QUERY:", query);

        const result = await requestCollection
            .find(query)
            .toArray();

        console.log("FOUND:", result);

        res.send(result);
    } catch (error) {
        console.error("SEARCH ERROR:", error);
        res.status(500).send({ message: "Server error" });
    }
});







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



// .............................................................................................




app.get('/donation-requests/recent', verifyFBToken, async (req, res) => {
    try {
        const email = req.decoded_email;

        const result = await requestCollection
            .find({ email })
            .sort({ createdAt: -1 })
            .limit(3)
            .toArray();

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to load recent requests" });
    }
});






const { ObjectId } = require('mongodb');

app.get('/donation-requests/:id', verifyFBToken, async (req, res) => {
    try {
        const id = req.params.id;

        const result = await requestCollection.findOne({
            _id: new ObjectId(id)
        });

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to get request" });
    }
});



app.delete('/donation-requests/:id', verifyFBToken, async (req, res) => {
    try {
        const id = req.params.id;

        const result = await requestCollection.deleteOne({
            _id: new ObjectId(id)
        });

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to delete request" });
    }
});




app.put('/donation-requests/:id', verifyFBToken, async (req, res) => {
    try {
        const id = req.params.id;
        const updatedData = req.body;

        const result = await requestCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedData }
        );

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to update request" });
    }
});




app.patch('/donation-requests/:id/status', verifyFBToken, async (req, res) => {
    try {
        const id = req.params.id;
        const { status } = req.body;

        if (!["done", "canceled"].includes(status)) {
            return res.status(400).send({ message: "Invalid status" });
        }

        const result = await requestCollection.updateOne(
            {
                _id: new ObjectId(id),
                status: "inprogress"
            },
            {
                $set: { status }
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(400).send({
                message: "Status update not allowed"
            });
        }

        res.send({ success: true });
    } catch (error) {
        res.status(500).send({ message: "Failed to update status" });
    }
});















        // Send a ping to confirm a successful connection

        // await client.db("admin").command({ ping: 1 });
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