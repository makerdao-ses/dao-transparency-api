import { getChildLogger } from "../logger.js"
import { createClient } from 'redis';
import { createHash } from 'crypto';

let client: any;

async function init() {
    client = await createClient({
        url: process.env.REDIS_STRING,
        socket: {
            tls: true,
            rejectUnauthorized: false,
        }
    }).on('error', (err: string) => console.log('Redis Client Error', err))
        .connect();
    client.flushAll("ASYNC", function (succeeded: any) {
        console.log(succeeded); // will be true if successfull
    });
}

export const measureQueryPerformance = async (queryName: string, moduleName: string, knexQuery: any) => {
    const start = Date.now(); // Start timing
    if (!client) {
        await init()
    }

    const logger = getChildLogger({}, { moduleName });
    const key = getHashKey(knexQuery);
    const value = await client.get(key);
    let results = null;
    if (value) {
        results = JSON.parse(value, dateTimeReviver);
    } else {
        results = await knexQuery;
        await client.set(key, JSON.stringify(results), { EX: 120 });
    }
    const end = Date.now(); // End timing
    logger.info({
        executionTime: `${(end - start) / 1000}s`,
        query: knexQuery.toString(),
    },
        queryName);

    return results;
};

const getHashKey = (knexQuery: any) => {
    let retKey = '';
    if (knexQuery) {
        const text = knexQuery.toString();
        retKey = createHash('BLAKE2s256').update(text).digest('hex');
    }
    return 'CACHE_ASIDE' + retKey;
};

const dateTimeReviver = function (key: any, value: any) {
    const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    let a;
    if (typeof value === 'string') {
        a = regex.exec(value);
        if (a) {
            return new Date(value);
        }
    }
    return value;
}
