import { ActionIcon, Group, Stack, Tabs, Title, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import useApp from '../../../providers/App/useApp';

import MantineIcon from '../../common/MantineIcon';
import ForbiddenPanel from '../../ForbiddenPanel';

import { FeatureFlags } from '@lightdash/common';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import GroupsView from './GroupsView';
import UsersView from './UsersView';

const UsersAndGroupsPanel: FC = () => {
    const { user } = useApp();
    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    if (!user.data) return null;

    if (user.data.ability.cannot('view', 'OrganizationMemberProfile')) {
        return <ForbiddenPanel />;
    }

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    return (
        <Stack spacing="sm">
            <Group spacing="two">
                {isGroupManagementEnabled ? (
                    <Title order={5}>Users and groups</Title>
                ) : (
                    <Title order={5}>User management settings</Title>
                )}
                <Tooltip label="Click here to learn more about user roles">
                    <ActionIcon
                        component="a"
                        href="https://docs.lightdash.com/references/roles"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Tabs defaultValue={'users'}>
                {isGroupManagementEnabled && (
                    <Tabs.List mx="one">
                        <Tabs.Tab value="users">Users</Tabs.Tab>
                        <Tabs.Tab value="groups">Groups</Tabs.Tab>
                    </Tabs.List>
                )}
                <Tabs.Panel value="users">
                    <UsersView />
                </Tabs.Panel>
                <Tabs.Panel value="groups">
                    <GroupsView />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
};

export default UsersAndGroupsPanel;
