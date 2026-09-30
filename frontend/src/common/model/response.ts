export interface RestResponse {
  code: number;
  msg: string;
}
export interface RestResultResponse<T> extends RestResponse {
  result: T;
}

export interface RestPage {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface RestPageResultResponse<T> extends RestResponse {
  page: RestPage;
  result: T[];
}
