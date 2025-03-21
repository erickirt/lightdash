import { Modal } from '@mantine/core';
import { type FC } from 'react';
import UnderlyingDataModalContent from './UnderlyingDataModalContent';
import { useMetricQueryDataContext } from './useMetricQueryDataContext';

const UnderlyingDataModal: FC = () => {
    const { isUnderlyingDataModalOpen, closeUnderlyingDataModal } =
        useMetricQueryDataContext();

    return isUnderlyingDataModalOpen ? (
        <Modal.Root
            centered
            opened
            onClose={closeUnderlyingDataModal}
            size="auto"
        >
            <Modal.Overlay />
            <UnderlyingDataModalContent />
        </Modal.Root>
    ) : null;
};

export default UnderlyingDataModal;
