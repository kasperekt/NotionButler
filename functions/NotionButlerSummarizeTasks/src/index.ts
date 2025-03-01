import { Client } from '@notionhq/client';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Handler } from 'aws-lambda';
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

interface EnvVariables {
    AWS_REGION: string;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends EnvVariables {}
    }
}

// Define the input parameters for the handler
interface SummarizeTasksInput {
    databaseId?: string;
    startDate?: string; // ISO string format
    endDate?: string; // ISO string format
    statuses?: string[]; // Array of status values to filter by
}

// Define the task summary output structure
interface TaskSummary {
    taskId: string;
    title: string;
    status: string;
    createdTime: string;
    lastEditedTime: string;
    url: string;
}

// Define the function response structure
interface SummarizeTasksResponse {
    statusCode: number;
    body: string;
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
            throw new Error('TasksDatabase parameter is missing or empty.');
        }

        return databaseId;
    } catch (error) {
        console.error('Error fetching TasksDatabase parameter:', error);
        throw new Error('Failed while getting TasksDatabase from SSM');
    }
};

export const handler: Handler<SummarizeTasksInput, SummarizeTasksResponse> = async (event) => {
    try {
        // Get required clients and IDs
        const notion = await getNotionClient();
        const databaseId = event.databaseId || await getDatabaseId();
        
        // Validate inputs
        if (!databaseId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Database ID is required'
                })
            };
        }
        
        // Build filter for date range and statuses
        const filter: any = { and: [] };
        
        // Add date range filter if provided
        if (event.startDate || event.endDate) {
            const dateFilter: any = {
                property: 'Created time',
                date: {}
            };
            
            if (event.startDate) {
                dateFilter.date.on_or_after = event.startDate;
            }
            
            if (event.endDate) {
                dateFilter.date.on_or_before = event.endDate;
            }
            
            filter.and.push(dateFilter);
        }
        
        // Add status filter if provided
        if (event.statuses && event.statuses.length > 0) {
            filter.and.push({
                property: 'Status',
                select: {
                    is_not_empty: true
                }
            });
            
            // Only support single status selection if multiple are provided
            if (event.statuses.length === 1) {
                filter.and.push({
                    property: 'Status',
                    select: {
                        equals: event.statuses[0]
                    }
                });
            } else {
                // For multiple statuses, we need to use the or operator
                const statusFilters = event.statuses.map(status => ({
                    property: 'Status',
                    select: {
                        equals: status
                    }
                }));
                
                filter.and.push({
                    or: statusFilters
                });
            }
        }
        
        // If there are no filters, remove the and array
        if (filter.and.length === 0) {
            filter.and = [{
                property: 'Created time',
                date: {
                    is_not_empty: true
                }
            }];
        }
        
        console.log('Querying Notion database with filter:', JSON.stringify(filter, null, 2));
        
        // Query the database with our filters
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: filter
        });
        
        // Process the results
        const tasks: TaskSummary[] = [];
        
        for (const page of response.results) {
            // Type guard to ensure we're working with a PageObjectResponse
            if (!('properties' in page)) {
                continue;
            }
            
            const pageObj = page as PageObjectResponse;
            
            // Extract title from the Name property (assumes title is stored in a property called "Name")
            const titleProperty = pageObj.properties['Name'];
            let title = 'Untitled';
            
            if (titleProperty && titleProperty.type === 'title' && 'title' in titleProperty && titleProperty.title.length > 0) {
                title = titleProperty.title.map((textObj: any) => textObj.plain_text).join('');
            }
            
            // Extract status (assumes status is stored in a property called "Status")
            const statusProperty = pageObj.properties['Status'];
            let status = 'Unknown';
            
            if (statusProperty && statusProperty.type === 'select' && 'select' in statusProperty && statusProperty.select) {
                status = statusProperty.select.name || 'Unknown';
            }
            
            // Add to our results
            tasks.push({
                taskId: pageObj.id,
                title,
                status,
                createdTime: pageObj.created_time,
                lastEditedTime: pageObj.last_edited_time,
                url: pageObj.url
            });
        }
        
        // Return the results
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                count: tasks.length,
                tasks: tasks
            })
        };
        
    } catch (error) {
        console.error('Error summarizing tasks:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: 'Failed to summarize tasks from Notion'
            })
        };
    }
};