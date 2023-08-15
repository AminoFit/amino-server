import { prisma } from "./prisma"
import { MessageStatus, MessageType } from "@prisma/client"

type UpdateMessageProps = {
  id: number
  status?: MessageStatus
  resolvedAt?: Date
  messageType?: MessageType
  itemsToProcess?: number
  incrementItemsProcessedBy?: number // New field to specify how much to increment by
  itemsProcessed?: number
}

export default async function UpdateMessage(props: UpdateMessageProps) {
  const { id, incrementItemsProcessedBy } = props;

  // Fetch the current message
  const currentMessage = await prisma.message.findUnique({
    where: { id },
  });

  // Increment the itemsProcessed count
  const newItemsProcessed = (currentMessage?.itemsProcessed ?? 0) + (incrementItemsProcessedBy ?? 0);

  // Check if all items have been processed
  if (newItemsProcessed === currentMessage?.itemsToProcess) {
    props.status = MessageStatus.RESOLVED;
  }

  // Build the update object based on the provided fields
  const updateData: any = {
    status: props.status,
    resolvedAt: props.resolvedAt,
    messageType: props.messageType,
    itemsToProcess: props.itemsToProcess,
    itemsProcessed: newItemsProcessed,
  };

  const updatedMessage = await prisma.message.update({
    where: { id },
    data: updateData,
  });

  return updatedMessage;
}