import app from './app';
import { startRetentionWorker } from './workers/retention.worker';
const PORT = 8080;

app.listen(PORT , ()=>{
    console.log("server is working on port " + PORT);

    startRetentionWorker(); 
})