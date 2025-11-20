const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const app = express();

const port = process.env.PORT || 4000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors({
    origin: ['http://localhost:5173',
            'https://job-portal-c1fda.web.app',
            'https://job-portal-c1fda.firebaseapp.com'
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());


// const logger = (req, res, next) =>{
//     console.log('inside the logger');
//     next();
// }

const verifyToken = (req, res, next) =>{
    // console.log('inside verifyToken logger', req.cookies);
    const token = req?.cookies?.token;

    if(!token){
        return res.status(401).send({message: 'Unauthorized access'})
    }

    // verify a token symmetric
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if(err){
           return res.status(401).send({message: 'Unauthorized access'}) 
        }

        req.user = decoded;
        next();
    });

    // next();
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.itvqvzm.mongodb.net/?appName=Cluster0`;

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
    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");

    //jobs related api
    const jobCollection = client.db("jobPortal").collection("jobs");
    const jobApplications = client.db("jobPortal").collection("job_applications");

    //auth related APIs
    app.post('/jwt', async(req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.
        cookie('token', token,{
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",

        })
        .send({success: true});
    })

    //logout
    app.post('/logout', (req, res)=>{
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({success: true});
    })


    //job api
    app.get('/jobs', async(req, res) =>{
        console.log('now inside the api callback')
        const email = req.query.email;
        let query = {};
        if(email){
            query = {hr_email: email}
        }

        const cursor = jobCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
    })

    app.get('/jobs/:id', async(req, res) =>{
        const id = req.params.id;
        const query = { _id: new ObjectId(id)};
        const result = await jobCollection.findOne(query);
        res.send(result);
    })

    app.post('/jobs', async(req, res) =>{
        const newJob = req.body;
        const result = await jobCollection.insertOne(newJob);
        res.send(result);
    })

    app.put('/jobs/:id', async (req, res)=>{
        const id = req.params.id;
        const filter = {_id: new ObjectId(id)};
        const options = {upsert: true};
        const updatedJob = req.body;
        const updatedJobInfo ={
            $set: {      
                 title: updatedJob.title,
                 location: updatedJob.location, 
                 jobType: updatedJob.jobType, 
                 category: updatedJob.category , 
                 applicationDeadline: updatedJob.applicationDeadline, 
                 salaryRange: updatedJob.salaryRange, 
                 description: updatedJob.description,
                 description: updatedJob.description,
                 company: updatedJob.company,
                requirements: updatedJob.requirements,
                responsibilities: updatedJob.responsibilities,
                 status: updatedJob.status,
                 hr_email: updatedJob.hr_email,
                 hr_name: updatedJob.hr_name,
                 company_logo: updatedJob.company_logo
            }
        }
        const result = await jobCollection.updateOne(filter, updatedJobInfo, options);
        res.send(result);
    })


    app.delete('/jobs/:id', async (req, res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await jobCollection.deleteOne(query);
        res.send(result);
    })



    //job application api
    app.get('/job-applications', verifyToken, async(req, res) =>{
        const email = req.query.email;
        const query = {application_email: email};

        if(req.user.email !== req.query.email){
            return res.status(403).send({message: 'Forbidden access'});
        }

        // console.log('Cookies:', req.cookies);  

        const result = await jobApplications.find(query).toArray();

        //get the jobs details
        for(const application of result){
            const query = { _id: new ObjectId(application.job_id)};
            const job = await jobCollection.findOne(query);
            if(job){
                application.title = job.title;
                application.location = job.location;
                application.company = job.company;
                application.company_logo = job.company_logo;
                application.jobType = job.jobType;
                application.category = job.category;
                application.applicationDeadline = job.applicationDeadline;

            }
        }

        res.send(result);
    })


    app.get('/job-applications/jobs/:job_id', async(req, res) =>{
        const jobId = req.params.job_id;
        const query = {job_id: jobId};
        const result = await jobApplications.find(query).toArray();
        res.send(result);
    })

    // Get a single job application by _id
    app.get('/job-applications/:id', async (req, res) => {
        
            const id = req.params.id;
            const application = await jobApplications.findOne({ _id: new ObjectId(id) });

            res.send(application);
        
    });



    app.post('/job-applications', async(req, res) =>{
        const application = req.body;
        const result = await jobApplications.insertOne(application);

        //not the best way
        const id = application.job_id;
        const query = {_id: new ObjectId(id)};
        const job = await jobCollection.findOne(query);
        console.log(job);
        let count = 0;
        if(job.applicationCount){
            count = job.applicationCount + 1;
        }
        else{
            count = 1;
        }
        const filter = {_id: new ObjectId(id)};
        const updatedDoc = {
            $set: {
                applicationCount: count
            }
        }
        const updateResult = await jobCollection.updateOne(filter, updatedDoc);

        res.send(result);
    })


    app.put('/job-applications/:id', async (req, res)=>{
        const id = req.params.id;
        const filter = {_id: new ObjectId(id)};
        const options = {upsert: true};
        const updatedApply = req.body;
        const updatedJobInfo ={
            $set: {      
                 linkedin: updatedApply.linkedin,
                 github: updatedApply.github, 
                 resume: updatedApply.resume, 

            }
        }
        const result = await jobApplications.updateOne(filter, updatedJobInfo, options);
        res.send(result);
    })


    app.patch('/job-applications/:id', async(req, res) =>{
        const id = req.params.id;
        const data = req.body;
        const filter = {_id: new ObjectId(id)};
        const updatedDoc = {
            $set: {
                status: data.status
            }
        }
        const result = await jobApplications.updateOne(filter, updatedDoc);
        res.send(result);
    })

    
    app.delete('/job-applications/:id', async (req, res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)};
        const result = await jobApplications.deleteOne(query);
        res.send(result);
    })



  } 
  
  finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Job portal server is running!')
})

app.listen(port, () => {
  console.log(`Job portal server is running on port ${port}`)
})




//show the token in jwt.io
//step for jwt secret token 
// in command => node -> require('crypto').randomBytes(64) -> require('crypto').randomBytes(64).toString() -> require('crypto').randomBytes(64).toString('hex') -> pick this key