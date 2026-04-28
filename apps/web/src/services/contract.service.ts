import api from './api';

export interface Contract {
  id: string;
  type: 'academy' | 'personal';
  document: string;
  name?: string | null;
  cref?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  addressNeighborhood?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressComplement?: string | null;
  addressZipCode?: string | null;
  logoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const contractService = {
  async getMe(): Promise<Contract> {
    const response = await api.get<{ success: boolean; data: Contract }>('/contracts/me');
    return response.data.data;
  },

  async updateMe(data: {
    name?: string;
    document?: string;
    cref?: string | null;
    addressStreet?: string | null;
    addressNumber?: string | null;
    addressNeighborhood?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressComplement?: string | null;
    addressZipCode?: string | null;
    logoUrl?: string | null;
  }): Promise<Contract> {
    const response = await api.put<{ success: boolean; data: Contract }>(
      '/contracts/me',
      data
    );
    return response.data.data;
  },

  async uploadLogo(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<{ success: boolean; data: { url: string } }>(
      '/contracts/logo-upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.data.url;
  },
};
