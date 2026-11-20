import { createLearningDataSource } from './learning-database';

export default createLearningDataSource(process.env.DATABASE_URL);
