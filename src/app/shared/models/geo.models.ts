export interface Department {
  code: string;
  name: string;
}

export interface City {
  code: string;
  name: string;
  departmentCode: string;
  type: string;
}

export interface DepartmentsResponse {
  departments: Department[];
}

export interface CitiesResponse {
  cities: City[];
}

export interface AddressLocationValue {
  departmentCode: string;
  departmentName: string;
  cityCode: string;
  cityName: string;
}
