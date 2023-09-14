import { ToadScheduler, AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { checkInventory, Initialized } from "./common-functions";
import { Unit } from "./g5-marketing-cloud-types";
require('dotenv').config();

//validate environment variables
if(!process.env.GRAPHQL_URL || !process.env.MAIL_TO || 
    !process.env.GMAIL_ACCOUNT || !process.env.GMAIL_PASS ||
    !process.env.INTERVAL_SECONDS || !process.env.LOCATION_URN ||
    !process.env.CUSTOM_MESSAGE_BEGIN || !process.env.CUSTOM_MESSAGE_END || 
    !process.env.MAIL_FROM || !process.env.EMAIL_SUBJECT) {
    throw new Error('Missing environment variables');
}

//get environment variables
const graphqlUrl = (process.env.GRAPHQL_URL as string).trim();
const mailTo = (process.env.MAIL_TO as string).trim();
const gmailAccount = (process.env.GMAIL_ACCOUNT as string).trim();
const gmailPassword = (process.env.GMAIL_PASS as string).trim();
const intervalSeconds = parseInt((process.env.INTERVAL_SECONDS as string).trim());
const locationUrn = (process.env.LOCATION_URN as string).trim();
const customMessageBegin = (process.env.CUSTOM_MESSAGE_BEGIN as string).trim();
const customMessageEnd = (process.env.CUSTOM_MESSAGE_END as string).trim();
const mailFrom = (process.env.MAIL_FROM as string).trim();
const emailSubject = (process.env.EMAIL_SUBJECT as string).trim();

//make sure we don't DOS the endpoint we're trying to query
if(intervalSeconds < 30) {
    throw new Error('Interval must be at least 30 seconds to prevent spamming the endpoint');
}

//log environment variables
console.log(`${new Date().toISOString()} - will run every    [${intervalSeconds}] seconds`);
console.log(`${new Date().toISOString()} - sending emails to [${mailTo}]`);
console.log(`${new Date().toISOString()} - sending emails from [${mailFrom}]`);
console.log(`${new Date().toISOString()} - using graphql url [${graphqlUrl}]`);
console.log(`${new Date().toISOString()} - using locationUrn [${locationUrn}]`);
console.log(`${new Date().toISOString()} - using customMessageBegin [${customMessageBegin}]`);
console.log(`${new Date().toISOString()} - using customMessageEnd [${customMessageEnd}]`);
console.log(`${new Date().toISOString()} - using emailSubject [${emailSubject}]`);

const units: Map<string, Unit> = new Map();
let currentUnitIds: string[] = [];
let prevUnitIds: string[] = [];

const scheduler = new ToadScheduler();
let initialized: Initialized = { initialized: false } as Initialized;

//run once at startup
checkInventory(graphqlUrl, units, prevUnitIds, currentUnitIds, mailTo, initialized, 
    gmailAccount, gmailPassword, locationUrn, customMessageBegin, customMessageEnd, mailFrom, emailSubject);

//create a task to run checkInventory function every intervalSeconds
const checkInventoryTask = new AsyncTask(
    'Check inventory task', 
    () => { return checkInventory(graphqlUrl, units, prevUnitIds, currentUnitIds, mailTo, initialized, 
        gmailAccount, gmailPassword, locationUrn, customMessageBegin, customMessageEnd, mailFrom, emailSubject).
        then((result) => {  }) },
    (err: Error) => { console.error(err) }
)
//create a job to run the checkInventoryTask every intervalSeconds
const job = new SimpleIntervalJob({ seconds: intervalSeconds }, checkInventoryTask);
//add the job to the scheduler
scheduler.addSimpleIntervalJob(job);