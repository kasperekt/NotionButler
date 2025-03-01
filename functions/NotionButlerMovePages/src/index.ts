import { Client } from '@notionhq/client';
import { Handler } from 'aws-lambda';
import * as dotenv from 'dotenv';
import { getConfig, getNotionClient } from 'notion-butler-shared';

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

async function runMovePages(config: SchedulesConfig) {
    // Use either the accessToken from config or get a new client
    const notion = config.accessToken 
        ? new Client({
            auth: config.accessToken,
            notionVersion: process.env.NOTION_VERSION,
          })
        : await getNotionClient(process.env.NOTION_VERSION);

    // Query for pages to move
    const { results: pagesToMove } = await notion.databases.query({
        database_id: config.databaseId,
        filter: {
            and: [
                {
                    or: config.config.status.watchedStatuses.map((watchedStatus) => ({
                        property: config.config.status.property,
                        status: {
                            equals: watchedStatus,
                        },
                    })),
                },
                {
                    property: config.config.date.property,
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
                        name: config.config.status.targetStatus,
                    },
                },
            },
        });

        movedTitles.push(
            (updatedPage as any).properties.Name.title[0].plain_text
        );
    }
}

export const handler: Handler<{ ssmPath: string }, { statusCode: number; body: string }> = async (event) => {
  try {
      const config = await getConfig<SchedulesConfig>(event.ssmPath);
      await runMovePages(config);

      return {
        statusCode: 200,
        body: 'Success'
      }
  } catch (error) {
    console.error('Error moving pages:', error);
    return {
        statusCode: 400,
        body: 'Failed while moving pages'
    }
  }
};
