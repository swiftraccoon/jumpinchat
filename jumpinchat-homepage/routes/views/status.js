import mongoose from 'mongoose';
import axios from 'axios';
import { api } from '../../constants/constants.js';

const CACHE_TTL = 30_000; // 30 seconds
let cached = null;
let cachedAt = 0;

async function checkService(name, checkFn) {
  const start = Date.now();
  try {
    await checkFn();
    return {
      name,
      status: 'operational',
      responseTime: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      status: 'down',
      responseTime: Date.now() - start,
    };
  }
}

async function getServiceStatus() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL) {
    return cached;
  }

  const services = await Promise.all([
    checkService('MongoDB', async () => {
      const state = mongoose.connection.readyState;
      if (state !== 1) {
        throw new Error('MongoDB not connected');
      }
    }),
    checkService('Web API', async () => {
      await axios.get(`${api}/api/status`, { timeout: 3000 });
    }),
    checkService('Email', async () => {
      await axios.get('http://email:3001/status', { timeout: 3000 });
    }),
  ]);

  cached = { services, lastChecked: new Date().toISOString() };
  cachedAt = now;
  return cached;
}

export default async function status(req, res) {
  const { locals } = res;

  locals.section = 'Status';
  locals.description = 'Service status page for JumpInChat';
  locals.user = req.user;

  const result = await getServiceStatus();
  locals.services = result.services;
  locals.lastChecked = result.lastChecked;

  return res.render('status');
}
