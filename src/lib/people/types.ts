/**
 * Lekiu (`people`) domain types. Field names match the `hr_*` columns one to
 * one, so the Supabase provider maps rows directly and the sample provider can
 * stand in for it in dev and tests. Money is integer cents. Dates are
 * `YYYY-MM-DD`; moments are ISO strings.
 *
 * Who may read a row is the database's decision (see the plan A migrations):
 * a provider returns whatever the caller's session is allowed to see.
 */

/** The fictional employee a demo visitor sees on the "My …" screens. Fixed by the demo seed. */
export const DEMO_EMPLOYEE_ID = 'dea97d89-a5b6-f264-bd42-c6df73f664a7';
export const DEMO_ORG_SLUG = 'rimba-ventures-demo';

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'intern';
export type EmployeeStatus = 'active' | 'inactive';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveType = 'annual' | 'medical' | 'emergency' | 'unpaid' | 'maternity' | 'paternity';
export type ClaimCategory = 'medical' | 'travel' | 'meals' | 'equipment' | 'other';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'on_leave';
export type ShiftKind = 'morning' | 'night' | 'off';

export type Department = { id: string; name: string; created_at: string };

/** The staff directory row: nothing here is private. */
export type Employee = {
  id: string;
  user_id: string | null;
  employee_no: string;
  name: string;
  work_email: string | null;
  department_id: string | null;
  /** The department's name, joined in by the provider. */
  department_name: string | null;
  designation: string | null;
  employment_type: EmploymentType;
  is_manager: boolean;
  join_date: string | null;
  status: EmployeeStatus;
  date_of_birth_day: number | null;
  date_of_birth_month: number | null;
  created_at: string;
};

/** Pay and identity details. Readable by HR and by the employee themselves. */
export type EmployeePrivate = {
  employee_id: string;
  nric: string | null;
  date_of_birth: string | null;
  phone: string | null;
  address: string | null;
  base_salary_cents: number | null;
  bank_name: string | null;
  bank_account: string | null;
  epf_no: string | null;
  socso_no: string | null;
  tax_no: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: RequestStatus;
  created_at: string;
};

export type LeaveBalance = {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  year: number;
  entitled_days: number;
  used_days: number;
};

export type TimeOffRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  off_date: string;
  /** `HH:MM:SS`. */
  start_time: string;
  end_time: string;
  reason: string | null;
  status: RequestStatus;
  created_at: string;
};

export type Claim = {
  id: string;
  employee_id: string;
  employee_name: string;
  category: ClaimCategory;
  amount_cents: number;
  claim_date: string;
  description: string | null;
  has_receipt: boolean;
  status: RequestStatus;
  created_at: string;
};

export type OvertimeRecord = {
  id: string;
  employee_id: string;
  employee_name: string;
  work_date: string;
  hours: number;
  rate_multiplier: number;
  amount_cents: number;
  status: RequestStatus;
  created_at: string;
};

export type AttendanceDay = {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceStatus;
};

export type TimesheetEntry = {
  id: string;
  employee_id: string;
  work_date: string;
  hours: number;
  billable_hours: number;
};

export type Shift = { id: string; employee_id: string; work_date: string; shift: ShiftKind };

export type PublicHoliday = {
  id: string;
  name: string;
  holiday_date: string;
  scope: 'national' | 'state';
  state: string | null;
};

export type PayrollRun = {
  id: string;
  /** The first day of the month the run pays. */
  period_month: string;
  status: 'draft' | 'paid';
  paid_at: string | null;
};

export type Payslip = {
  id: string;
  employee_id: string;
  employee_name: string;
  payroll_run_id: string;
  period_month: string;
  gross_cents: number;
  epf_cents: number;
  socso_cents: number;
  eis_cents: number;
  pcb_cents: number;
  net_cents: number;
  status: 'pending' | 'paid';
};

export type Goal = {
  id: string;
  employee_id: string;
  employee_name: string;
  title: string;
  progress: number;
  due_date: string | null;
  status: 'on_track' | 'at_risk' | 'done';
};

export type Scorecard = {
  id: string;
  employee_id: string;
  employee_name: string;
  period: string;
  score: number;
  competencies: Record<string, number>;
};

export type Review = {
  id: string;
  employee_id: string;
  employee_name: string;
  period: string;
  rating: 'exceeds' | 'meets' | 'below';
  score: number;
  reviewer_name: string | null;
  reviewed_at: string | null;
};

export type Training = {
  id: string;
  title: string;
  category: string | null;
  provider: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: 'upcoming' | 'in_progress' | 'completed';
};

export type TrainingEnrolment = {
  id: string;
  employee_id: string;
  training_id: string;
  completed: boolean;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  category: 'general' | 'holiday' | 'benefits' | 'strategy' | 'policy';
  published_at: string;
  author_name: string | null;
};

/**
 * Everything the Overview and the lookups read. One provider per request.
 * Each method returns the rows this caller may see: all of them for HR, only
 * their own personal rows for anyone else.
 */
export type PeopleData = {
  listDepartments(): Promise<Department[]>;
  listEmployees(): Promise<Employee[]>;
  /** Null when there is no private row, or the caller may not read it. */
  getEmployeePrivate(employeeId: string): Promise<EmployeePrivate | null>;
  listLeaveRequests(): Promise<LeaveRequest[]>;
  listLeaveBalances(year: number): Promise<LeaveBalance[]>;
  listTimeOffRequests(): Promise<TimeOffRequest[]>;
  listClaims(): Promise<Claim[]>;
  listOvertime(): Promise<OvertimeRecord[]>;
  /** Attendance from `fromDate` to `toDate`, both included. */
  listAttendance(fromDate: string, toDate: string): Promise<AttendanceDay[]>;
  listTimesheet(fromDate: string, toDate: string): Promise<TimesheetEntry[]>;
  listShifts(fromDate: string, toDate: string): Promise<Shift[]>;
  listPublicHolidays(): Promise<PublicHoliday[]>;
  listPayrollRuns(): Promise<PayrollRun[]>;
  listPayslips(): Promise<Payslip[]>;
  listGoals(): Promise<Goal[]>;
  listScorecards(): Promise<Scorecard[]>;
  listReviews(): Promise<Review[]>;
  listTrainings(): Promise<Training[]>;
  listTrainingEnrolments(): Promise<TrainingEnrolment[]>;
  listAnnouncements(): Promise<Announcement[]>;
};

/** Who is looking: used for wording and defaults, never to decide what they may read. */
export type PeopleViewer = {
  /** The employee record linked to this user, if any. */
  employeeId: string | null;
  /** The linked employee's name, when there is a linked record. For wording only. */
  employeeName?: string;
  /** Owner or admin of the workspace. */
  isHr: boolean;
  /** The current workspace is the demo workspace. */
  isDemo: boolean;
};
