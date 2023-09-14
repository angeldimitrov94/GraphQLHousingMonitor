import axios from "axios";
import nodeMailer, { Transporter } from "nodemailer";
import { G5MarketingGraphQLQuery, Unit, FloorplanIdsResponse } from "./g5-marketing-cloud-types";

let LOCATION_URN: string = "";
let floorplanIdQuery: G5MarketingGraphQLQuery = {
    operationName: "ApartmentComplex",
    variables: {
        locationUrn: '',
        beds: 2
    },
    query: "query ApartmentComplex($floorplanId: Int, $locationUrn: String!, $beds: [Int!]) {apartmentComplex(locationUrn: $locationUrn){floorplans(id: $floorplanId, beds: $beds){id}}}"
} as G5MarketingGraphQLQuery;

type Initialized = {
    initialized: boolean;
}

var transporter: Transporter | undefined = undefined;

async function fetchUnits(graphqlQuery: G5MarketingGraphQLQuery, graphqlUrl: string): Promise<Unit[] | null> {
    try {
        const response = await axios({
            url: graphqlUrl,
            method: 'post',
            data: graphqlQuery
        });

        if (response && response.data && response.data.data && response.data.data.units) {
            return response.data.data.units as Unit[];
        } else {
            return null;
        }
    } catch (error) {
        console.error(`${new Date().toISOString()} - Error fetching units: ${error}`);
        return null;
    }
}

async function checkInventory(graphqlUrl: string,
    units: Map<string, Unit>, prevUnitIds: string[], currentUnitIds: string[],
    mailTo: string, initialized: Initialized, gmailAccount: string, gmailPassword: string,
    locationUrn: string, customMessageBegin: string, customMessageEnd: string, mailFrom: string, emailSubject: string): Promise<void> {
    if(!locationUrn || locationUrn === "") {
        throw new Error('Invalid locationUrn');
    } 
    
    LOCATION_URN = locationUrn;
    if(!floorplanIdQuery.variables) {
        throw new Error('No floorPlanIdQuery variables!');
    } else {
        floorplanIdQuery.variables.locationUrn = LOCATION_URN;
    }

    try {
        if (initialized && !initialized.initialized) {
            transporter = nodeMailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: gmailAccount,
                    pass: gmailPassword
                }
            });
        }

        const floorplanIds = await getCurrentFloorplanIds(graphqlUrl);
        const floorPlanQueries = [];

        if (floorplanIds) {
            for (const floorplanId of floorplanIds) {
                floorPlanQueries.push(createDynamicFloorplanIdGraphQLQuery(floorplanId, locationUrn));
            }
        }

        const thisRunUnits = await getUnits(floorPlanQueries, graphqlUrl);
        if (thisRunUnits !== null) {
            const appeared = processUnits(thisRunUnits, units, prevUnitIds, currentUnitIds);

            if (initialized && initialized.initialized && appeared !== null && appeared.length > 0) {
                sendEmail(appeared, units, mailTo, customMessageBegin, customMessageEnd, mailFrom, emailSubject);
            }

            if (initialized && !initialized.initialized) {
                initialized.initialized = true;
                console.log(`${new Date().toISOString()} - initialized, skipping email, will alert on next event`);
            }
        }
    } catch (error) {
        console.error(`${new Date().toISOString()} - Error checking inventory: ${error}`);
    }
}

async function getUnits(graphqlQueries: G5MarketingGraphQLQuery[], graphqlUrl: string): Promise<Unit[] | null> {
    const thisRunUnits = [];

    try {
        for (const graphqlQuery of graphqlQueries) {
            const thisQueryUnits = await fetchUnits(graphqlQuery, graphqlUrl);
            if (thisQueryUnits) {
                thisRunUnits.push(...thisQueryUnits);
            }
        }
    } catch (error) {
        console.error(`${new Date().toISOString()} - Error getting units : ${error}`);
        return null;
    }

    return thisRunUnits;
}

function processUnits(newUnits: Unit[], units: Map<string, Unit>, prevUnitIds: string[], currentUnitIds: string[]): string[] | null {
    if (!newUnits) {
        return null;
    }

    const newUnitIds = newUnits.map(unit => unit.externalId);
    prevUnitIds.length = 0;
    prevUnitIds.push(...currentUnitIds);
    currentUnitIds.length = 0;
    currentUnitIds.push(...newUnitIds);
    const disappeared = difference(prevUnitIds, currentUnitIds);
    const appeared = difference(currentUnitIds, prevUnitIds);

    disappeared.forEach(keyToRemove => {
        if (keyToRemove in units) {
            units.delete(keyToRemove);
        }
    });

    appeared.forEach(keyToAdd => {
        units.set(keyToAdd, newUnits.filter(unit => unit.externalId === keyToAdd)[0]);
    });

    if (appeared.length > 0) {
        console.log(`${new Date().toISOString()} - appeared : ${appeared}`);
    }

    if (disappeared.length > 0) {
        console.log(`${new Date().toISOString()} - disappeared : ${disappeared}`);
    }

    return appeared;
}

function sendEmail(newUnitIds: string[], units: Map<string, Unit>, 
    mailTo: string, customMessageBegin: string, customMessageEnd: string, mailFrom: string, 
    emailSubject: string) {
    let msg = customMessageBegin + "\r\n";

    newUnitIds.forEach(newUnitID => {
        const thisUnit = units.get(newUnitID);
        msg += `Unit ID : ${newUnitID}\r\n
        Unit availability date : ${thisUnit?.availabilityDate}\r\n
        Unit prices : ${JSON.stringify(thisUnit?.prices[0]?.formattedPrice)}\r\n\r\n`;
    });

    if(customMessageEnd != '') {
        msg += customMessageEnd;
    }

    var emailToSelf = {
        from: mailFrom,
        to: mailTo,
        subject: emailSubject,
        text: msg
    };

    if (transporter) {
        transporter.sendMail(emailToSelf, function (error: any, info: any) {
            if (error) {
                console.log(`${new Date().toISOString()} - Email error: ${error}`);
            } else {
                console.log(`${new Date().toISOString()} - Email sent: [envelope] ${info?.envelope} [response] ${info?.response}`);
            }
        });
    }
}

function createDynamicFloorplanIdGraphQLQuery(floorplanId: number, locationUrn: string): G5MarketingGraphQLQuery {
    return {
        operationName: "Units",
        variables: {
            "locationUrn": locationUrn,
            "floorplanId": floorplanId
        },
        query: "query Units($floorplanId: Int!, $locationUrn: String) {\n  units(floorplanId: $floorplanId, locationUrn: $locationUrn) {\n    id\n    externalId\n    name\n    availabilityDate\n    prices {\n      formattedPrice\n}\n  }\n}\n"
    } as G5MarketingGraphQLQuery
}

async function getCurrentFloorplanIds(graphqlUrl: string): Promise<number[] | null> {
    try {
        console.log(floorplanIdQuery);
        const response = await axios({
            url: graphqlUrl,
            method: 'post',
            data: floorplanIdQuery
        });

        if (response && response.data && response.data.data && response.data.data.apartmentComplex && response.data.data.apartmentComplex.floorplans) {
            const floorplanIdsResponse: FloorplanIdsResponse = response.data as FloorplanIdsResponse;
            const floorplanIds: number[] = floorplanIdsResponse.data.apartmentComplex.floorplans.map(floorplan => floorplan.id);

            return floorplanIds;
        } else {
            console.log(`${new Date().toISOString()} - ${response.data}`);
            return null;
        }
    } catch (error) {
        console.error(`${new Date().toISOString()} - Error fetching floor plan ids: ${error}`);
        return null;
    }
}

/**
 * Check what items ARE in 'a' but NOT in 'b'
 * @param {Array} a 
 * @param {Array} b 
 * @returns 
 */
function difference<T>(a: T[], b: T[]) {
    return a.filter(x => !b.includes(x));
}

export { checkInventory, fetchUnits, getUnits, processUnits, sendEmail, G5MarketingGraphQLQuery as GraphQLQuery, Unit, Initialized };