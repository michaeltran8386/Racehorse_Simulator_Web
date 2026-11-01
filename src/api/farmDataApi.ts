import { api } from './client.ts';
import { toStallZones, type StaffMember, type StallZone } from '../sim/stallMap.ts';

/** Sơ đồ khu/ô chuồng thật (chỉ đọc). Lỗi mạng/BE được ném ra để giao diện báo lỗi, không có dữ liệu thay thế. */
export async function fetchStallZones(): Promise<StallZone[]> {
  return toStallZones(await api<any[]>('GET', '/simulator/stalls'));
}

/** Nhân sự đang làm việc: tên, vai trò, ca trực hôm nay, ngựa phụ trách. */
export async function fetchStaff(): Promise<StaffMember[]> {
  return api<StaffMember[]>('GET', '/simulator/staff');
}
