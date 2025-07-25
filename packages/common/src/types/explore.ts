import {
    type DbtModelJoinType,
    type LineageGraph,
    type SupportedDbtAdapter,
} from './dbt';
import {
    type CompiledDimension,
    type CompiledMetric,
    type Dimension,
    type Metric,
    type Source,
} from './field';
import { type LightdashProjectConfig } from './lightdashProjectConfig';
import { type TableBase } from './table';

export enum JoinRelationship {
    ONE_TO_MANY = 'one-to-many',
    MANY_TO_ONE = 'many-to-one',
    ONE_TO_ONE = 'one-to-one',
    MANY_TO_MANY = 'many-to-many',
}

export type ExploreJoin = {
    table: string; // Must match a tableName in containing Explore
    sqlOn: string; // Built sql
    type?: DbtModelJoinType; // Optional join type
    alias?: string; // Optional alias for the joined tableName
    label?: string; // Optional UI label override for the underlying table
    hidden?: boolean;
    fields?: string[]; // Optional list of fields to include from the joined table
    always?: boolean; // Optional flag to always join the table
    relationship?: JoinRelationship;
};

export type CompiledExploreJoin = Pick<
    ExploreJoin,
    'table' | 'sqlOn' | 'type' | 'hidden' | 'always' | 'relationship'
> & {
    compiledSqlOn: string; // SQL on clause with template variables resolved
    tablesReferences?: string[]; // Tables referenced in SQL. Optional, to keep it backwards compatible.
    parameterReferences?: string[];
};

export type CompiledTable = TableBase & {
    dimensions: Record<string, CompiledDimension>;
    metrics: Record<string, CompiledMetric>;
    lineageGraph: LineageGraph;
    source?: Source | undefined;
    uncompiledSqlWhere?: string;
    parameterReferences?: string[];
};

export enum ExploreType {
    VIRTUAL = 'virtual',
    DEFAULT = 'default',
}

export type Explore = {
    name: string; // Must be sql friendly (a-Z, 0-9, _)
    label: string; // Friendly name
    tags: string[];
    groupLabel?: string;
    baseTable: string; // Must match a tableName in tables
    joinedTables: CompiledExploreJoin[]; // Must match a tableName in tables
    tables: { [tableName: string]: CompiledTable }; // All tables in this explore, potentially filtered by user attributes
    unfilteredTables?: { [tableName: string]: CompiledTable }; // All tables, without user attribute filters, for error handling
    targetDatabase: SupportedDbtAdapter; // Type of target database e.g. postgres/redshift/bigquery/snowflake/databricks
    warehouse?: string;
    databricksCompute?: string;
    ymlPath?: string;
    sqlPath?: string;
    type?: ExploreType;
    // Spotlight config for this explore
    spotlight?: {
        visibility: LightdashProjectConfig['spotlight']['default_visibility'];
        categories?: string[]; // yaml_reference
    };
    aiHint?: string | string[];
};

export enum InlineErrorType {
    METADATA_PARSE_ERROR = 'METADATA_PARSE_ERROR',
    NO_DIMENSIONS_FOUND = 'NO_DIMENSIONS_FOUND',
}

export type InlineError = {
    type: InlineErrorType;
    message: string;
};

export type ExploreError = Partial<Explore> &
    Pick<Explore, 'name' | 'label' | 'groupLabel'> & {
        errors: InlineError[];
    };

export const isExploreError = (
    explore: Explore | ExploreError,
): explore is ExploreError => 'errors' in explore;

type SummaryExploreFields =
    | 'name'
    | 'label'
    | 'tags'
    | 'groupLabel'
    | 'type'
    | 'aiHint';
type SummaryExploreErrorFields = SummaryExploreFields | 'errors';
type SummaryExtraFields = {
    description?: string;
    schemaName: string;
    databaseName: string;
};

export type SummaryExplore =
    | (Pick<Explore, SummaryExploreFields> & SummaryExtraFields)
    | (Pick<ExploreError, SummaryExploreErrorFields> &
          Partial<SummaryExtraFields>);

export type Table = TableBase & {
    dimensions: { [fieldName: string]: Dimension }; // Field names must be unique across dims and metrics
    metrics: { [fieldName: string]: Metric }; //
    lineageGraph: LineageGraph; // DAG structure representing the lineage of the table
    source?: Source;
};

export enum CustomViewType {
    VIRTUAL = 'virtual',
    WRITE_BACK = 'write_back',
}
