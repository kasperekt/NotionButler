import { Client } from '@notionhq/client'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Handler } from 'aws-lambda';
import * as dotenv from 'dotenv';

dotenv.config();

interface EnvVariables {
    NOTION_VERSION?: string;
    AWS_REGION?: string;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends EnvVariables {}
    }
}

const ssm = new SSMClient({ region: process.env.AWS_REGION });

interface SchedulesConfig {
    accessToken: string;
    databaseId: string;
    config: {
        date: {
            property: string;
        }
        status: {
            property: string;
            watchedStatuses: string[];
            targetStatus: string;
        }
    }
}

async function runMovePages({
	accessToken,
	databaseId,
	config,
}: SchedulesConfig) {
	const notion = new Client({
		auth: accessToken,
		notionVersion: process.env.NOTION_VERSION,
	});

	// Query for pages to move
	const { results: pagesToMove } = await notion.databases.query({
		database_id: databaseId,
		filter: {
			and: [
				{
					or: config.status.watchedStatuses.map((watchedStatus) => ({
						property: config.status.property,
						status: {
							equals: watchedStatus,
						},
					})),
				},
				{
					property: config.date.property,
					date: {
						on_or_before: new Date().toISOString(),
					},
				},
			],
		},
	});

	const movedTitles: string[] = [];

	// Process moved pages
	for (const page of pagesToMove) {
		const updatedPage = await notion.pages.update({
			page_id: page.id,
			properties: {
				Status: {
					status: {
						name: config.status.targetStatus,
					},
				},
			},
		});

		movedTitles.push(
			(updatedPage as any).properties.Name.title[0].plain_text
		);
	}
}

async function getButlerConfig(configPath: string): Promise<SchedulesConfig> {
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

    return JSON.parse(configValue) as SchedulesConfig;
  } catch (error) {
    console.error('Error fetching parameter:', error);
    throw new Error('Failed while getting SSM parameter')
  }
}

export const handler: Handler<{ ssmPath: string }, { statusCode: number; body: string }> = async (event) => {
  const config = await getButlerConfig(event.ssmPath)
  
  try {
      await runMovePages(config);

      return {
        statusCode: 200,
        body: 'Success'
      }
  } catch (error) {
    return {
        statusCode: 400,
        body: 'Failed while moving pages'
    }
  }
};
