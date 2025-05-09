import { Knex } from 'knex';

export type DbOrganization = {
    organization_id: number;
    organization_uuid: string;
    organization_name: string;
    created_at: Date;
    chart_colors?: string[];
    default_project_uuid: string | null;
    color_palette_uuid: string | null;
};

export type DbOrganizationIn = Pick<DbOrganization, 'organization_name'>;
export type DbOrganizationUpdate = Partial<
    Pick<
        DbOrganization,
        'organization_name' | 'default_project_uuid' | 'color_palette_uuid'
    >
>;

export type OrganizationTable = Knex.CompositeTableType<
    DbOrganization,
    DbOrganizationIn,
    DbOrganizationUpdate
>;

export const OrganizationTableName = 'organizations';
