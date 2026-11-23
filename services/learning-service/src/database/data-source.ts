import { loadLearningEnvironment } from '../load-environment';
import { createLearningDataSource } from './learning-database';

loadLearningEnvironment();
export default createLearningDataSource(process.env.DATABASE_URL);
