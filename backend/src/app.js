import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.use('/api', apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
