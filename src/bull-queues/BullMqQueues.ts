import { Queue, Worker } from 'bullmq'
import IORedis from "ioredis";

if (!process.env.BULL_MQ_REDIS_URL) {
  console.error('BULL_MQ_REDIS_URL is not set')
  process.exit(1)
}

if (!process.env.BULL_MQ_PLATFORM) {
  console.error('BULL_MQ_PLATFORM is not set. Should be sometime like "PROD" or "DEV-COUDRON". You\'ll need to set the same env in amino-icons.')
  process.exit(1)
}


export const IconQueue = new Queue(`icon-queue-${process.env.BULL_MQ_PLATFORM}`, { connection: new IORedis(process.env.BULL_MQ_REDIS_URL) });
