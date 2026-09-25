import { Group, Loader, Stack, Text } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { IconFileUpload, IconUpload, IconX } from '@tabler/icons-react'

export const FILE_TYPES = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'],
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  csv: ['text/csv', 'text/plain'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
}

interface Props {
  onFiles: (files: File[]) => void
  accept: string[]
  title: string
  hint?: string
  loading?: boolean
  multiple?: boolean
  minHeight?: number
}

/** Gemeinsame Drag-&-Drop-Fläche für alle Module. */
export default function DropZone({ onFiles, accept, title, hint, loading, multiple = true, minHeight = 140 }: Props): React.JSX.Element {
  return (
    <Dropzone
      onDrop={onFiles}
      accept={accept}
      multiple={multiple}
      loading={loading}
      maxSize={40 * 1024 ** 2}
      radius="md"
      loaderProps={{ children: <Loader /> }}
    >
      <Group justify="center" gap="lg" mih={minHeight} style={{ pointerEvents: 'none' }}>
        <Dropzone.Accept>
          <IconUpload size={48} stroke={1.5} color="var(--mantine-primary-color-filled)" />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX size={48} stroke={1.5} color="var(--mantine-color-red-6)" />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <IconFileUpload size={48} stroke={1.5} color="var(--mantine-color-dimmed)" />
        </Dropzone.Idle>
        <Stack gap={2}>
          <Text size="lg" fw={600}>
            {title}
          </Text>
          {hint && (
            <Text size="sm" c="dimmed">
              {hint}
            </Text>
          )}
        </Stack>
      </Group>
    </Dropzone>
  )
}
