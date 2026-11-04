import React from "react";
import type { ExplainPlan } from "../../../types/explain";
import { IndexAdvisorPanel } from "../../explain/IndexAdvisorPanel";

export interface ExplainDiffViewProps {
  plan: ExplainPlan;
  connectionId?: string | null;
  schema?: string | null;
  onInsertSql?: (sql: string) => void;
}

export const ExplainDiffView: React.FC<ExplainDiffViewProps> = ({
  plan,
  connectionId,
  schema,
  onInsertSql,
}) => (
  <div className="flex-1 overflow-y-auto p-6 bg-base/20">
    <IndexAdvisorPanel
      plan={plan}
      connectionId={connectionId}
      schema={schema}
      onInsertSql={onInsertSql}
    />
  </div>
);
