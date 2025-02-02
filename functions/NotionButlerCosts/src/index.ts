import { Handler } from 'aws-lambda';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import * as dotenv from 'dotenv'

dotenv.config()

interface EnvVariables {
    AWS_REGION?: string;
    INFAKT_TOKEN_SSM_PATH?: string;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends EnvVariables {}
    }
}

const ssm = new SSMClient({ region: process.env.AWS_REGION })

const getInfaktToken = async (): Promise<string> => {
    const getParameterCommand = new GetParameterCommand({
        Name: process.env.INFAKT_TOKEN_SSM_PATH,
        WithDecryption: true
    });

    try {
        const parameterResult = await ssm.send(getParameterCommand);
        const token = parameterResult.Parameter?.Value;

        if (!token) {
            throw new Error('InfaktToken parameter is missing or empty.');
        }

        return token;
    } catch (error) {
        console.error('Error fetching InfaktToken parameter:', error);
        throw new Error('Failed while getting InfaktToken from SSM');
    }
};


async function getCosts() {
    const infaktToken = await getInfaktToken();
    console.log('Hello from InFakt')
}

export const handler: Handler<{ test: string; }, { statusCode: number; }> = async (event) => {   
    return {
        statusCode: 200
    }
}