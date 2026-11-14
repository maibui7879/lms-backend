import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('course_completion_policies')
export class CompletionPolicy {
  @PrimaryColumn({ type: 'uuid' })
  courseId!: string;

  @PrimaryColumn({ type: 'integer' })
  contentVersion!: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  requiredItemIds!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  requiredAssessments!: Array<{
    quizId: string;
    assessmentVersion: number;
    passingScorePercent: number;
  }>;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  chapterPolicies!: Array<{
    chapterId: string;
    requiredItemIds: string[];
    requiredAssessments: Array<{
      quizId: string;
      assessmentVersion: number;
      passingScorePercent: number;
    }>;
  }>;

  @Column({ type: 'varchar', length: 20 })
  sequence!: 'FREE' | 'SEQUENTIAL';

  @Column({
    type: 'varchar',
    length: 50,
    default: 'ANY_PASSED_ATTEMPT_SAME_VERSION',
  })
  assessmentRule!: 'ANY_PASSED_ATTEMPT_SAME_VERSION';

  @Column({ type: 'boolean', default: false })
  certificateEnabled!: boolean;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
