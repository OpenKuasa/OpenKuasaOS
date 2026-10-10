import { describe, expect, it } from 'vitest';
import { approvalDetail, approvalTitle, collectNames, nameIn } from '@/lib/chat/change-titles';

const EMP = '22222222-2222-4222-8222-222222222222';
const DEPT = '11111111-1111-4111-8111-111111111111';
const results = [
  { tool: 'listEmployees', output: { total: 1, employees: [{ id: EMP, name: 'Faiz Hakim' }] } },
  { tool: 'listDepartments', output: { total: 1, departments: [{ id: DEPT, name: 'Marketing', headcount: 3 }] } },
];
const named = nameIn(results);

describe('approval cards for HR changes', () => {
  it('names the employee a change is about', () => {
    expect(approvalTitle('createEmployee', { name: 'Farah Idris' })).toBe('Add employee “Farah Idris”?');
    expect(approvalTitle('updateEmployee', { id: EMP, designation: 'Lead' }, named)).toBe(
      'Save changes to employee “Faiz Hakim”?',
    );
    expect(approvalTitle('setEmployeeStatus', { id: EMP, status: 'inactive' }, named)).toBe(
      'Deactivate employee “Faiz Hakim”?',
    );
    expect(approvalTitle('setEmployeeStatus', { id: EMP, status: 'active' }, named)).toBe(
      'Reactivate employee “Faiz Hakim”?',
    );
    expect(approvalTitle('deleteEmployee', { id: EMP }, named)).toBe('Delete employee “Faiz Hakim”?');
  });

  it('says what linking does', () => {
    expect(approvalTitle('linkEmployeeToMember', { id: EMP, memberEmail: 'faiz@example.com' }, named)).toBe(
      'Link employee “Faiz Hakim” to the account faiz@example.com?',
    );
    expect(approvalTitle('linkEmployeeToMember', { id: EMP, memberEmail: null }, named)).toBe(
      'Unlink employee “Faiz Hakim” from their account?',
    );
    // Only an explicit null unlinks; a blank or missing email is not a request to.
    expect(approvalTitle('linkEmployeeToMember', { id: EMP, memberEmail: '  ' }, named)).toBe('Approve this change?');
    expect(approvalTitle('linkEmployeeToMember', { id: EMP }, named)).toBe('Approve this change?');
  });

  it('names the department a change is about', () => {
    expect(approvalTitle('createDepartment', { name: 'Legal' })).toBe('Add department “Legal”?');
    expect(approvalTitle('updateDepartment', { id: DEPT, name: 'Brand' }, named)).toBe(
      'Rename department “Marketing” to “Brand”?',
    );
    expect(approvalTitle('deleteDepartment', { id: DEPT }, named)).toBe('Delete department “Marketing”?');
  });

  it('falls back to plain words when the name is not known', () => {
    expect(approvalTitle('deleteEmployee', { id: EMP })).toBe('Delete this employee?');
    expect(approvalTitle('updateDepartment', { id: DEPT, name: 'Brand' })).toBe('Rename this department to “Brand”?');
  });

  it('never puts a name of the wrong kind on a card', () => {
    // An employee change given a department's id, and the other way round.
    expect(approvalTitle('deleteEmployee', { id: DEPT }, named)).toBe('Delete this employee?');
    expect(approvalTitle('deleteDepartment', { id: EMP }, named)).toBe('Delete this department?');
  });

  it('warns what goes with a deleted employee', () => {
    expect(approvalDetail('deleteEmployee')).toBe(
      'Their leave, claims, payslips and every other HR record are deleted too. This cannot be undone.',
    );
    expect(approvalDetail('deleteDepartment')).toBe('This cannot be undone.');
    expect(approvalDetail('updateEmployee')).toBeNull();
  });

  it('says what an employee update sets', () => {
    expect(
      approvalDetail('updateEmployee', { id: EMP, designation: 'Lead', private: { base_salary: 4500 } }),
    ).toBe('Changes: designation, monthly salary (RM 4,500.00)');
  });

  it('says a bank account is cleared without showing it', () => {
    expect(approvalDetail('updateEmployee', { id: EMP, private: { bank_account: null } })).toBe(
      'Changes: bank account (cleared)',
    );
    expect(approvalDetail('updateEmployee', { id: EMP, work_email: '' })).toBe('Changes: work email (cleared)');
  });

  it('shows a status change and a work email sent through updateEmployee', () => {
    expect(approvalDetail('updateEmployee', { id: EMP, status: 'inactive', work_email: 'f@example.com' })).toBe(
      'Changes: work email (f@example.com), status (inactive)',
    );
  });

  it('names sensitive fields on an update but never shows their values', () => {
    const detail = approvalDetail('updateEmployee', {
      id: EMP,
      private: { nric: '900101-14-5678', phone: '012-3456789', address: '1 Jalan Satu', tax_no: 'SG123' },
    });
    expect(detail).toBe('Changes: NRIC, phone, address, tax number');
  });

  it('lists what a new employee is given, without the NRIC value', () => {
    const detail = approvalDetail('createEmployee', {
      name: 'Farah Idris',
      private: { base_salary: 4500, nric: '900101-14-5678' },
    });
    expect(detail).toBe('Sets: monthly salary (RM 4,500.00), NRIC');
    expect(detail).not.toContain('900101');
  });

  it('gives a new employee with only a name no detail line', () => {
    expect(approvalDetail('createEmployee', { name: 'Farah Idris' })).toBeNull();
  });

  it('remembers employee and department names by kind for later turns', () => {
    expect(collectNames(results)).toEqual({ [`employee:${EMP}`]: 'Faiz Hakim', [`department:${DEPT}`]: 'Marketing' });
  });
});
