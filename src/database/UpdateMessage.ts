import { prisma } from "./prisma";
import { MessageStatus, MessageType } from "@prisma/client";

type UpdateMessageProps = {
  id: number;
  status?: MessageStatus;
  resolvedAt?: Date;
  messageType?: MessageType;
  itemsToProcess?: number;
  incrementItemsProcessedBy?: number;  // New field to specify how much to increment by
  itemsProcessed?: number;
};

export default async function UpdateMessage(props: UpdateMessageProps) {
  const { id, status, resolvedAt, messageType, itemsToProcess, incrementItemsProcessedBy, itemsProcessed } = props;

  // Build the update object based on the provided fields
  const updateData: any = {};

  if (status) updateData.status = status;
  if (resolvedAt) updateData.resolvedAt = resolvedAt;
  if (messageType) updateData.messageType = messageType;
  if (typeof itemsToProcess === "number") updateData.itemsToProcess = itemsToProcess;
  if (typeof incrementItemsProcessedBy === "number") {
    updateData.itemsProcessed = {
      increment: incrementItemsProcessedBy
    };
  } else if (typeof itemsProcessed === "number") {
    updateData.itemsProcessed = itemsProcessed;
  }

  const updatedMessage = await prisma.message.update({
    where: { id },
    data: updateData,
  });

  return updatedMessage;
}