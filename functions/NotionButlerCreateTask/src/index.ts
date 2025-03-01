import { Client } from '@notionhq/client'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import {  Handler } from 'aws-lambda';
import { markdownToRichText } from '@tryfabric/martian'

interface EnvVariables {
    AWS_REGION: string;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends EnvVariables {}
    }
}

const ssm = new SSMClient({ region: process.env.AWS_REGION });

const getNotionClient = async (): Promise<Client> => {
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

        return new Client({ auth: token });
    } catch (error) {
        console.error('Error fetching NotionToken parameter:', error);
        throw new Error('Failed while getting NotionToken from SSM');
    }
};

const getDatabaseId = async (): Promise<string> => {
    const getParameterCommand = new GetParameterCommand({
        Name: '/NotionButler/Personal/TasksDatabase'
    });

    try {
        const parameterResult = await ssm.send(getParameterCommand);
        const databaseId = parameterResult.Parameter?.Value;

        if (!databaseId) {
            throw new Error('NotionToken parameter is missing or empty.');
        }

        return databaseId;
    } catch (error) {
        console.error('Error fetching NotionToken parameter:', error);
        throw new Error('Failed while getting NotionToken from SSM');
    }
};


export const handler: Handler<{ title?: string; message?: string; }, { statusCode: number; body: string }> = async (event) => {
    if (!event.title || !event.message) {
        console.error('Missing required parameters:', { title: !!event.title, message: !!event.message });
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing required parameters: title and message are required' })
        };
    }

    try {
        const notion = await getNotionClient();
        const databaseId = await getDatabaseId();

        console.log('Creating task with title:', event.title);
        const richText = markdownToRichText(event.message);

        const response = await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
                Name: {
                    title: [
                        {
                            text: {
                                content: event.title,
                            },
                        },
                    ],
                },
                Description: {
                    rich_text: richText,
                },
            },
        });

        console.log('Task created successfully:', response.id);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true,
                message: 'Task created successfully',
                taskId: response.id
            })
        };
    } catch (error) {
        console.error('Error creating task:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                success: false,
                error: 'Failed to create task in Notion'
            })
        };
    }
};
