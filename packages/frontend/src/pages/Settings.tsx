import { subject } from '@casl/ability';
import { CommercialFeatureFlags, FeatureFlags } from '@lightdash/common';
import { Box, ScrollArea, Stack, Text, Title } from '@mantine/core';
import {
    IconBrowser,
    IconBuildingSkyscraper,
    IconCalendarStats,
    IconChecklist,
    IconDatabase,
    IconDatabaseCog,
    IconDatabaseExport,
    IconKey,
    IconLock,
    IconPalette,
    IconPlug,
    IconReportAnalytics,
    IconTableOptions,
    IconUserCircle,
    IconUserCode,
    IconUserPlus,
    IconUserShield,
    IconUsers,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { Navigate, useRoutes, type RouteObject } from 'react-router';
import PageSpinner from '../components/PageSpinner';
import AccessTokensPanel from '../components/UserSettings/AccessTokensPanel';
import AllowedDomainsPanel from '../components/UserSettings/AllowedDomainsPanel';
import AppearanceSettingsPanel from '../components/UserSettings/AppearanceSettingsPanel';
import DefaultProjectPanel from '../components/UserSettings/DefaultProjectPanel';
import { DeleteOrganizationPanel } from '../components/UserSettings/DeleteOrganizationPanel';
import GithubSettingsPanel from '../components/UserSettings/GithubSettingsPanel';
import { MyWarehouseConnectionsPanel } from '../components/UserSettings/MyWarehouseConnectionsPanel';
import OrganizationPanel from '../components/UserSettings/OrganizationPanel';
import PasswordPanel from '../components/UserSettings/PasswordPanel';
import ProfilePanel from '../components/UserSettings/ProfilePanel';
import ProjectManagementPanel from '../components/UserSettings/ProjectManagementPanel';
import SlackSettingsPanel from '../components/UserSettings/SlackSettingsPanel';
import SocialLoginsPanel from '../components/UserSettings/SocialLoginsPanel';
import UserAttributesPanel from '../components/UserSettings/UserAttributesPanel';
import UsersAndGroupsPanel from '../components/UserSettings/UsersAndGroupsPanel';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import RouterNavLink from '../components/common/RouterNavLink';
import { SettingsGridCard } from '../components/common/Settings/SettingsCard';
import ScimAccessTokensPanel from '../ee/features/scim/components/ScimAccessTokensPanel';
import { ServiceAccountsPage } from '../ee/features/serviceAccounts';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import {
    useFeatureFlag,
    useFeatureFlagEnabled,
} from '../hooks/useFeatureFlagEnabled';
import { useProject } from '../hooks/useProject';
import useApp from '../providers/App/useApp';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import useTracking from '../providers/Tracking/useTracking';
import { EventName, PageName } from '../types/Events';
import ProjectSettings from './ProjectSettings';

const Settings: FC = () => {
    const { data: embeddingEnabled } = useFeatureFlag(
        CommercialFeatureFlags.Embedding,
    );

    const { data: isScimTokenManagementEnabled } = useFeatureFlag(
        CommercialFeatureFlags.Scim,
    );

    const isServiceAccountFeatureFlagEnabled = useFeatureFlagEnabled(
        CommercialFeatureFlags.ServiceAccounts,
    );

    const {
        health: {
            data: health,
            isInitialLoading: isHealthLoading,
            error: healthError,
        },
        user: { data: user, isInitialLoading: isUserLoading, error: userError },
    } = useApp();

    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const { track } = useTracking();
    const {
        data: organization,
        isInitialLoading: isOrganizationLoading,
        error: organizationError,
    } = useOrganization();
    const { activeProjectUuid, isLoading: isActiveProjectUuidLoading } =
        useActiveProjectUuid();
    const {
        data: project,
        isInitialLoading: isProjectLoading,
        error: projectError,
    } = useProject(activeProjectUuid);

    const allowPasswordAuthentication =
        !health?.auth.disablePasswordAuthentication;

    const hasSocialLogin =
        health?.auth.google.enabled ||
        health?.auth.okta.enabled ||
        health?.auth.oneLogin.enabled ||
        health?.auth.azuread.enabled ||
        health?.auth.oidc.enabled;

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    // This allows us to enable service accounts in the UI for on-premise installations
    const isServiceAccountsEnabled =
        health?.isServiceAccountEnabled || isServiceAccountFeatureFlagEnabled;

    const routes = useMemo<RouteObject[]>(() => {
        const allowedRoutes: RouteObject[] = [
            {
                path: '/appearance',
                element: <AppearanceSettingsPanel />,
            },
            {
                path: '/profile',
                element: (
                    <SettingsGridCard>
                        <Title order={4}>Profile settings</Title>
                        <ProfilePanel />
                    </SettingsGridCard>
                ),
            },
            {
                path: '*',
                element: <Navigate to="/generalSettings/profile" />,
            },
        ];

        if (allowPasswordAuthentication) {
            allowedRoutes.push({
                path: '/password',
                element: (
                    <Stack spacing="xl">
                        <SettingsGridCard>
                            <Title order={4}>Password settings</Title>
                            <PasswordPanel />
                        </SettingsGridCard>

                        {hasSocialLogin && (
                            <SettingsGridCard>
                                <Title order={4}>Social logins</Title>
                                <SocialLoginsPanel />
                            </SettingsGridCard>
                        )}
                    </Stack>
                ),
            });
        }
        allowedRoutes.push({
            path: '/myWarehouseConnections',
            element: (
                <Stack spacing="xl">
                    <MyWarehouseConnectionsPanel />
                </Stack>
            ),
        });
        if (user?.ability.can('manage', 'PersonalAccessToken')) {
            allowedRoutes.push({
                path: '/organization',
                element: (
                    <Stack spacing="xl">
                        <SettingsGridCard>
                            <Title order={4}>General</Title>
                            <OrganizationPanel />
                        </SettingsGridCard>

                        <SettingsGridCard>
                            <div>
                                <Title order={4}>Allowed email domains</Title>
                                <Text c="gray.6" fz="xs">
                                    Anyone with email addresses at these domains
                                    can automatically join the organization.
                                </Text>
                            </div>
                            <AllowedDomainsPanel />
                        </SettingsGridCard>

                        <SettingsGridCard>
                            <div>
                                <Title order={4}>Default Project</Title>
                                <Text c="gray.6" fz="xs">
                                    This is the project users will see when they
                                    log in for the first time or from a new
                                    device. If a user does not have access, they
                                    will see their next accessible project.
                                </Text>
                            </div>
                            <DefaultProjectPanel />
                        </SettingsGridCard>

                        {user.ability?.can('delete', 'Organization') && (
                            <SettingsGridCard>
                                <div>
                                    <Title order={4}>Danger zone </Title>
                                    <Text c="gray.6" fz="xs">
                                        This action deletes the whole workspace
                                        and all its content, including users.
                                        This action is not reversible.
                                    </Text>
                                </div>
                                <DeleteOrganizationPanel />
                            </SettingsGridCard>
                        )}
                    </Stack>
                ),
            });
        }
        if (
            user?.ability.can(
                'manage',
                subject('OrganizationMemberProfile', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/userManagement',
                element: <UsersAndGroupsPanel />,
            });
        }

        if (
            user?.ability.can(
                'manage',
                subject('Organization', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/userAttributes',
                element: <UserAttributesPanel />,
            });
        }
        if (
            organization &&
            !organization.needsProject &&
            user?.ability.can('view', 'Project')
        ) {
            allowedRoutes.push({
                path: '/projectManagement',
                element: <ProjectManagementPanel />,
            });
        }

        if (
            project &&
            organization &&
            !organization.needsProject &&
            user?.ability.can(
                'update',
                subject('Project', {
                    organizationUuid: organization.organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/projectManagement/:projectUuid/*',
                element: (
                    <TrackPage name={PageName.PROJECT_SETTINGS}>
                        <ProjectSettings />
                    </TrackPage>
                ),
            });
        }
        if (user?.ability.can('manage', 'PersonalAccessToken')) {
            allowedRoutes.push({
                path: '/personalAccessTokens',
                element: <AccessTokensPanel />,
            });
        }

        if (user?.ability.can('manage', 'Organization')) {
            allowedRoutes.push({
                path: '/integrations',
                element: (
                    <Stack>
                        <Title order={4}>Integrations</Title>
                        {!health?.hasSlack &&
                            !health?.hasGithub &&
                            'No integrations available'}
                        {health?.hasSlack && <SlackSettingsPanel />}
                        {health?.hasGithub && <GithubSettingsPanel />}
                    </Stack>
                ),
            });
        }

        // Commercial route
        if (
            user?.ability.can('manage', 'Organization') &&
            isScimTokenManagementEnabled?.enabled
        ) {
            allowedRoutes.push({
                path: '/scimAccessTokens',
                element: <ScimAccessTokensPanel />,
            });
        }

        if (
            user?.ability.can('manage', 'Organization') &&
            isServiceAccountsEnabled
        ) {
            allowedRoutes.push({
                path: '/serviceAccounts',
                element: <ServiceAccountsPage />,
            });
        }

        return allowedRoutes;
    }, [
        isServiceAccountsEnabled,
        isScimTokenManagementEnabled?.enabled,
        allowPasswordAuthentication,
        hasSocialLogin,
        user,
        organization,
        project,
        health,
    ]);
    const routeElements = useRoutes(routes);

    if (
        isHealthLoading ||
        isUserLoading ||
        isOrganizationLoading ||
        isActiveProjectUuidLoading ||
        isProjectLoading
    ) {
        return <PageSpinner />;
    }

    if (userError || healthError || organizationError || projectError) {
        return (
            <ErrorState
                error={
                    userError?.error ||
                    healthError?.error ||
                    organizationError?.error ||
                    projectError?.error
                }
            />
        );
    }

    if (!health || !user || !organization) return null;

    return (
        <Page
            withFullHeight
            withSidebarFooter
            withFixedContent
            withPaddedContent
            title="Settings"
            sidebar={
                <Stack sx={{ flexGrow: 1, overflow: 'hidden' }}>
                    <PageBreadcrumbs
                        items={[{ title: 'Settings', active: true }]}
                    />
                    <ScrollArea
                        variant="primary"
                        offsetScrollbars
                        scrollbarSize={8}
                    >
                        <Stack spacing="lg">
                            <Box>
                                <Title order={6} fw={600} mb="xs">
                                    Your settings
                                </Title>

                                <RouterNavLink
                                    exact
                                    to="/generalSettings"
                                    label="Profile"
                                    icon={<MantineIcon icon={IconUserCircle} />}
                                />

                                {allowPasswordAuthentication && (
                                    <RouterNavLink
                                        label={
                                            hasSocialLogin
                                                ? 'Password & Social Logins'
                                                : 'Password'
                                        }
                                        exact
                                        to="/generalSettings/password"
                                        icon={<MantineIcon icon={IconLock} />}
                                    />
                                )}

                                <RouterNavLink
                                    label="My warehouse connections"
                                    exact
                                    to="/generalSettings/myWarehouseConnections"
                                    icon={
                                        <MantineIcon icon={IconDatabaseCog} />
                                    }
                                />
                                {user.ability.can(
                                    'manage',
                                    'PersonalAccessToken',
                                ) && (
                                    <RouterNavLink
                                        label="Personal access tokens"
                                        exact
                                        to="/generalSettings/personalAccessTokens"
                                        icon={<MantineIcon icon={IconKey} />}
                                    />
                                )}
                            </Box>

                            <Box>
                                <Title order={6} fw={600} mb="xs">
                                    Organization settings
                                </Title>

                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label="General"
                                        to="/generalSettings/organization"
                                        exact
                                        icon={
                                            <MantineIcon
                                                icon={IconBuildingSkyscraper}
                                            />
                                        }
                                    />
                                )}

                                {user.ability.can(
                                    'update',
                                    'OrganizationMemberProfile',
                                ) && (
                                    <RouterNavLink
                                        label={
                                            isGroupManagementEnabled
                                                ? 'Users & groups'
                                                : 'User management'
                                        }
                                        to="/generalSettings/userManagement"
                                        exact
                                        icon={
                                            <MantineIcon icon={IconUserPlus} />
                                        }
                                    />
                                )}
                                {user.ability.can(
                                    'manage',
                                    subject('Organization', {
                                        organizationUuid:
                                            organization.organizationUuid,
                                    }),
                                ) && (
                                    <RouterNavLink
                                        label={
                                            isGroupManagementEnabled
                                                ? 'User & group attributes'
                                                : 'User attributes'
                                        }
                                        to="/generalSettings/userAttributes"
                                        exact
                                        icon={
                                            <MantineIcon
                                                icon={IconUserShield}
                                            />
                                        }
                                    />
                                )}

                                {user.ability.can('update', 'Organization') && (
                                    <RouterNavLink
                                        label="Appearance"
                                        exact
                                        to="/generalSettings/appearance"
                                        icon={
                                            <MantineIcon icon={IconPalette} />
                                        }
                                    />
                                )}

                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label="Integrations"
                                        exact
                                        to="/generalSettings/integrations"
                                        icon={<MantineIcon icon={IconPlug} />}
                                    />
                                )}

                                {organization &&
                                    !organization.needsProject &&
                                    user.ability.can('view', 'Project') && (
                                        <RouterNavLink
                                            label="All projects"
                                            to="/generalSettings/projectManagement"
                                            exact
                                            icon={
                                                <MantineIcon
                                                    icon={IconDatabase}
                                                />
                                            }
                                        />
                                    )}

                                {user.ability.can('manage', 'Organization') &&
                                    isScimTokenManagementEnabled?.enabled && (
                                        <RouterNavLink
                                            label="SCIM Access Tokens"
                                            exact
                                            to="/generalSettings/scimAccessTokens"
                                            icon={
                                                <MantineIcon icon={IconKey} />
                                            }
                                        />
                                    )}
                                {user.ability.can('manage', 'Organization') &&
                                    isServiceAccountsEnabled && (
                                        <RouterNavLink
                                            label="Service Accounts"
                                            exact
                                            to="/generalSettings/serviceAccounts"
                                            icon={
                                                <MantineIcon
                                                    icon={IconUserCode}
                                                />
                                            }
                                        />
                                    )}
                            </Box>

                            {organization &&
                            !organization.needsProject &&
                            project &&
                            user.ability.can(
                                'update',
                                subject('Project', {
                                    organizationUuid:
                                        organization.organizationUuid,
                                    projectUuid: project.projectUuid,
                                }),
                            ) ? (
                                <Box>
                                    <Title order={6} fw={600} mb="xs">
                                        Current project ({project?.name})
                                    </Title>

                                    <RouterNavLink
                                        label="Connection settings"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/settings`}
                                        icon={
                                            <MantineIcon
                                                icon={IconDatabaseCog}
                                            />
                                        }
                                    />

                                    <RouterNavLink
                                        label="Tables configuration"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/tablesConfiguration`}
                                        icon={
                                            <MantineIcon
                                                icon={IconTableOptions}
                                            />
                                        }
                                    />

                                    <RouterNavLink
                                        label="Project access"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/projectAccess`}
                                        icon={<MantineIcon icon={IconUsers} />}
                                    />

                                    {user.ability.can(
                                        'view',
                                        subject('Analytics', {
                                            organizationUuid:
                                                organization.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label="Usage analytics"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/usageAnalytics`}
                                            onClick={() => {
                                                track({
                                                    name: EventName.USAGE_ANALYTICS_CLICKED,
                                                });
                                            }}
                                            icon={
                                                <MantineIcon
                                                    icon={IconReportAnalytics}
                                                />
                                            }
                                        />
                                    ) : null}

                                    <RouterNavLink
                                        label="Syncs & Scheduled deliveries"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/scheduledDeliveries`}
                                        icon={
                                            <MantineIcon
                                                icon={IconCalendarStats}
                                            />
                                        }
                                    />

                                    {user.ability?.can(
                                        'update',
                                        subject('Project', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) && embeddingEnabled?.enabled ? (
                                        <RouterNavLink
                                            label="Embed configuration"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/embed`}
                                            icon={
                                                <MantineIcon
                                                    icon={IconBrowser}
                                                />
                                            }
                                        />
                                    ) : null}

                                    {user.ability?.can(
                                        'manage',
                                        subject('Validation', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label="Validator"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/validator`}
                                            icon={
                                                <MantineIcon
                                                    icon={IconChecklist}
                                                />
                                            }
                                        />
                                    ) : null}

                                    {user.ability?.can(
                                        'promote',
                                        subject('SavedChart', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label="Data ops"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/dataOps`}
                                            icon={
                                                <MantineIcon
                                                    icon={IconDatabaseExport}
                                                />
                                            }
                                        />
                                    ) : null}
                                </Box>
                            ) : null}
                        </Stack>
                    </ScrollArea>
                </Stack>
            }
        >
            {routeElements}
        </Page>
    );
};

export default Settings;
