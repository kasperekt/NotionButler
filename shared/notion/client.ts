import { Client } from '@notionhq/client';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

// Initialize the SSM client
const ssm = new SSMClient({ region: process.env.AWS_REGION });

/**
 * Creates an authenticated Notion client using the token from SSM
 * @returns A configured Notion client
 */
export const getNotionClient = async (notionVersion?: string): Promise<Client> => {
    const getParameterCommand = new GetParameterCommand({
        Name: '/NotionButler/NotionToken',
        WithDecryption: true
    });

    try {
        const parameterResult = await ssm.send(getParameterCommand);
        const token = parameterResult.Parameter?.Value;

        if (!token) {
            throw new Error('NotionToken parameter is missing or empty.');
        }

        return new Client({ 
            auth: token,
            ...(notionVersion ? { notionVersion } : {})
        });
    } catch (error) {
        console.error('Error fetching NotionToken parameter:', error);
        throw new Error('Failed while getting NotionToken from SSM');
    }
};

/**
 * Retrieves a database ID from SSM parameter store
 * @param paramName The name of the parameter (appended to /NotionButler/)
 * @returns The database ID as a string
 */
export const getDatabaseId = async (paramName: string = 'Personal/TasksDatabase'): Promise<string> => {
    const getParameterCommand = new GetParameterCommand({
        Name: `/NotionButler/${paramName}`
    });

    try {
        const parameterResult = await ssm.send(getParameterCommand);
        const databaseId = parameterResult.Parameter?.Value;

        if (!databaseId) {
            throw new Error(`${paramName} parameter is missing or empty.`);
        }

        return databaseId;
    } catch (error) {
        console.error(`Error fetching ${paramName} parameter:`, error);
        throw new Error(`Failed while getting ${paramName} from SSM`);
    }
};

/**
 * Retrieves any configuration from SSM parameter store and parses it as JSON
 * @param configPath The path to the configuration (appended to /NotionButler/)
 * @returns The parsed configuration object
 */
export const getConfig = async <T>(configPath: string): Promise<T> => {
    const getParameterCommand = new GetParameterCommand({
        Name: `/NotionButler/${configPath.replace(/^\//, '')}`,
        WithDecryption: true
    });

    try {
        const parameterResult = await ssm.send(getParameterCommand);
        const configValue = parameterResult.Parameter?.Value;

        if (!configValue) {
            throw new Error('Configuration parameter is missing or empty.');
        }

        return JSON.parse(configValue) as T;
    } catch (error) {
        console.error('Error fetching parameter:', error);
        throw new Error('Failed while getting SSM parameter');
    }
};