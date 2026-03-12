CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
CREATE INDEX IF NOT EXISTS idx_execution_plans_work_item_id ON execution_plans(work_item_id);
CREATE INDEX IF NOT EXISTS idx_plan_steps_plan_id ON plan_steps(plan_id);
CREATE INDEX IF NOT EXISTS idx_mail_to_agent_read ON mail(to_agent, read);
CREATE INDEX IF NOT EXISTS idx_mail_work_item_id ON mail(work_item_id);
CREATE INDEX IF NOT EXISTS idx_leases_role ON leases(role);
CREATE INDEX IF NOT EXISTS idx_leases_active ON leases(active);
